import { InterceptorSkipHeader } from '@foundation/auth/state';
import { EntityFile } from '@foundation/files/models';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { filter, firstValueFrom, take } from 'rxjs';
import { FilesRepository } from './files.repository';

/** GCS resumable-upload chunk size must be a multiple of 256KiB (except the very last chunk of a session) */
const MIN_FLUSH_BYTES = 1024 * 1024;
/** Flush whatever is buffered at least this often even if MIN_FLUSH_BYTES hasn't been reached, so a chunk
 * always lands in storage every few seconds instead of waiting for a slow talker to fill the buffer. */
const MAX_FLUSH_INTERVAL_MS = 3000;

/**
 * Turns a RecorderService recording session into a resilient, progressively-uploaded file,
 * mirroring the pattern already proven in production by `audio-request-block.component.ts`
 * (the interview runner's audio step):
 *
 *  - during recording, chunks stream to `{file_id}/original_chunked/*` — a **backup**, so a
 *    crash/closed browser still leaves whatever was captured in storage;
 *  - on stop, the complete recorder blob is uploaded to `{file_id}/original` — the
 *    **authoritative** artifact. It is the better file: RecorderService runs
 *    `fixWebmDuration()` on it, which concatenated raw chunks don't get (hence the backend's
 *    container-repair transcode in the merge path).
 *
 * Both objects existing under one EntityFile is deliberate redundancy, not waste. The chunks
 * are only ever *consumed* by `recoverFromChunkUpload$` — the manual recovery path used when
 * the final upload never happened. Chunk failures are therefore best-effort and must never
 * block the authoritative upload.
 *
 * One instance per recording. Wire `pushChunk` as RecorderService.startRecording's chunk
 * callback (fires per MediaRecorder `dataavailable` tick), then call `finish(file)` on stop.
 */
export class ResilientMediaUploadSession {
	private _httpClient: HttpClient;
	private _entityFile: EntityFile | null = null;
	private _buffer: Blob[] = [];
	private _bufferedBytes = 0;
	private _bytesUploaded = 0;
	private _lastFlushTime = Date.now();
	/** Serializes chunk uploads so we never race two PUTs for overlapping byte ranges. */
	private _uploadQueue: Promise<void> = Promise.resolve();

	constructor(
		private _filesRepository: FilesRepository,
		httpClient: HttpClient,
		private _fileName: string,
		private _contentType: string,
		private _alternative: string = 'original'
	) {
		this._httpClient = httpClient;
	}

	/** Creates the EntityFile row up front, before any bytes exist. */
	async start(): Promise<EntityFile> {
		const response = await firstValueFrom(this._filesRepository.getResumableUploadUrl$(this._fileName, this._contentType, undefined, this._alternative));
		const entityFile = response.result?.data;
		if (!entityFile) throw new Error('ResilientMediaUploadSession: failed to create the entity file for a resilient recording upload.');
		this._entityFile = entityFile;
		return entityFile;
	}

	/** Wire directly as RecorderService's chunkCallback. Buffers small MediaRecorder ticks and
	 * flushes them as a storage chunk once enough bytes have accumulated (or enough time has
	 * passed), matching the existing chunk-upload endpoint's expectations. */
	pushChunk(blob: Blob): void {
		this._buffer.push(blob);
		this._bufferedBytes += blob.size;

		const shouldFlush = this._bufferedBytes >= MIN_FLUSH_BYTES || (this._bufferedBytes > 0 && Date.now() - this._lastFlushTime > MAX_FLUSH_INTERVAL_MS);
		if (shouldFlush) this._flush();
	}

	/** Uploads the complete recorder blob to the same EntityFile as the authoritative artifact,
	 * exactly as `audio-request-block.component.ts` does. The streamed chunks are deliberately
	 * left in place as the crash-recovery backup -- they are not merged here, and a failed
	 * chunk never blocks this upload. */
	async finish(file: File, duration?: number): Promise<EntityFile> {
		if (this._bufferedBytes > 0) this._flush();
		// Chunks are a best-effort backup: never let a failed one stop the real upload.
		await this._uploadQueue.catch(() => undefined);

		const entityFile = this._requireEntityFile();
		const results = await firstValueFrom(this._filesRepository.handleFileList$([file], { fileId: entityFile.id, duration }));
		const uploadedFile = results[0]?.result?.file;
		if (!uploadedFile) throw new Error('ResilientMediaUploadSession: the final upload did not return a file.');
		return uploadedFile;
	}

	private _flush(): void {
		const blob = new Blob(this._buffer, { type: this._contentType });
		this._buffer = [];
		this._bufferedBytes = 0;
		this._lastFlushTime = Date.now();

		const start = this._bytesUploaded;
		const end = start + blob.size - 1;
		this._bytesUploaded += blob.size;

		// Each chunk swallows its own failure: losing a backup chunk degrades recoverability,
		// it must not break the chunk stream that follows nor the authoritative upload.
		this._uploadQueue = this._uploadQueue.then(() =>
			this._uploadChunk(blob, start, end).catch((error) => {
				console.warn('[ResilientMediaUploadSession] backup chunk upload failed', error);
			})
		);
	}

	private async _uploadChunk(blob: Blob, start: number, end: number): Promise<void> {
		const entityFile = this._requireEntityFile();
		const response = await firstValueFrom(this._filesRepository.getChunkUploadUrl$(entityFile.id, this._alternative, start, end));
		const uploadUrl = response.result?.uploadUrl;
		if (!uploadUrl) throw new Error(`ResilientMediaUploadSession: no chunk upload url for bytes ${start}-${end}.`);

		const headers = new HttpHeaders().set(InterceptorSkipHeader, '').set('Content-Type', this._contentType);
		try {
			await firstValueFrom(this._httpClient.put(uploadUrl.replace(':4200', ':8000'), blob, { headers }));
		} catch (error) {
			// GCS resumable uploads return 308 for an intermediate chunk of an incomplete session --
			// that's the expected success response here, not a failure.
			if ((error as { status?: number })?.status !== 308) throw error;
		}
	}

	private _requireEntityFile(): EntityFile {
		if (!this._entityFile) throw new Error('ResilientMediaUploadSession: start() must complete before uploading or finishing.');
		return this._entityFile;
	}

	/** Rebuilds a file from its backup chunks, for a recording whose authoritative upload never
	 * happened (browser closed / crashed mid-recording). This is the *only* consumer of the
	 * chunks -- the manual recovery path, same as the interview runner's "Recover recording"
	 * action. Resolves once the merge task has finished and the file is back in storage. */
	static async recover(filesRepository: FilesRepository, fileId: string, alternative: string = 'original'): Promise<EntityFile> {
		const response = await firstValueFrom(filesRepository.recoverFromChunkUpload$(fileId, alternative));
		const taskId = response.result?.taskId;
		if (!taskId) throw new Error('ResilientMediaUploadSession: no chunks available to recover this recording.');

		await firstValueFrom(filesRepository.getTaskProgress$(taskId).pipe(filter((progress) => !progress || !!progress.ended || !!progress.completed || !!progress.failed)));

		return firstValueFrom(
			filesRepository.store.getObjectById$$$(fileId, true, true).$.pipe(
				filter((file): file is EntityFile => !!file),
				take(1)
			)
		);
	}
}
