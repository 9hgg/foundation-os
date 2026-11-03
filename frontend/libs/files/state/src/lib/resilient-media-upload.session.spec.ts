import { of, throwError } from 'rxjs';
import { ResilientMediaUploadSession } from './resilient-media-upload.session';

describe('ResilientMediaUploadSession', () => {
	let filesRepositoryMock: {
		getResumableUploadUrl$: ReturnType<typeof vi.fn>;
		getChunkUploadUrl$: ReturnType<typeof vi.fn>;
		recoverFromChunkUpload$: ReturnType<typeof vi.fn>;
		getTaskProgress$: ReturnType<typeof vi.fn>;
		handleFileList$: ReturnType<typeof vi.fn>;
		store: { getObjectById$$$: ReturnType<typeof vi.fn> };
	};
	let httpClientMock: { put: ReturnType<typeof vi.fn> };

	beforeEach(() => {
		filesRepositoryMock = {
			getResumableUploadUrl$: vi.fn(() => of({ result: { data: { id: 'file-1' } } })),
			getChunkUploadUrl$: vi.fn(() => of({ result: { uploadUrl: 'https://storage/upload-chunk' } })),
			recoverFromChunkUpload$: vi.fn(() => of({ result: { taskId: 'task-1' } })),
			getTaskProgress$: vi.fn(() => of({ id: 'task-1', progress: 1, completed: true })),
			handleFileList$: vi.fn(() => of([{ result: { file: { id: 'file-1', inStorage: true } } }])),
			store: { getObjectById$$$: vi.fn(() => ({ $: of({ id: 'file-1', inStorage: true }) })) },
		};
		httpClientMock = { put: vi.fn(() => of({})) };
	});

	const finalFile = () => new File(['data'], 'recording.webm', { type: 'video/webm' });

	function create() {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		return new ResilientMediaUploadSession(filesRepositoryMock as any, httpClientMock as any, 'recording.webm', 'video/webm');
	}

	it('start creates the entity file up front, with no fileId (a fresh file, not an existing one)', async () => {
		const session = create();

		const entityFile = await session.start();

		expect(entityFile).toEqual({ id: 'file-1' });
		expect(filesRepositoryMock.getResumableUploadUrl$).toHaveBeenCalledWith('recording.webm', 'video/webm', undefined, 'original');
	});

	it('start throws when no entity file is returned', async () => {
		filesRepositoryMock.getResumableUploadUrl$.mockReturnValue(of({ result: { data: undefined } }));
		const session = create();

		await expect(session.start()).rejects.toThrow();
	});

	it('pushChunk buffers small ticks and only flushes once enough bytes accumulate', async () => {
		const session = create();
		await session.start();

		session.pushChunk(new Blob([new Uint8Array(1024)]));
		expect(httpClientMock.put).not.toHaveBeenCalled();

		session.pushChunk(new Blob([new Uint8Array(2 * 1024 * 1024)]));
		await Promise.resolve();
		await Promise.resolve();

		expect(httpClientMock.put).toHaveBeenCalledTimes(1);
		expect(filesRepositoryMock.getChunkUploadUrl$).toHaveBeenCalledWith('file-1', 'original', 0, 2 * 1024 * 1024 + 1024 - 1);
	});

	it('finish uploads the complete recorder blob to the same EntityFile as the authoritative artifact', async () => {
		const session = create();
		await session.start();
		const file = finalFile();

		const result = await session.finish(file, 12.5);

		expect(filesRepositoryMock.handleFileList$).toHaveBeenCalledWith([file], { fileId: 'file-1', duration: 12.5 });
		expect(result).toEqual({ id: 'file-1', inStorage: true });
	});

	it('finish leaves the streamed chunks in place as the crash-recovery backup -- it does not merge them', async () => {
		const session = create();
		await session.start();
		session.pushChunk(new Blob([new Uint8Array(2 * 1024 * 1024)]));
		await Promise.resolve();
		await Promise.resolve();

		await session.finish(finalFile());

		// the chunk backup was written...
		expect(httpClientMock.put).toHaveBeenCalledTimes(1);
		// ...and deliberately left alone: merging is only the manual recovery path.
		expect(filesRepositoryMock.recoverFromChunkUpload$).not.toHaveBeenCalled();
	});

	it('treats an HTTP 308 (incomplete resumable session) as a successful chunk upload, not an error', async () => {
		httpClientMock.put.mockReturnValue(throwError(() => ({ status: 308 })));
		const session = create();
		await session.start();
		session.pushChunk(new Blob([new Uint8Array(2 * 1024 * 1024)]));

		await expect(session.finish(finalFile())).resolves.toBeDefined();
	});

	it('a failed backup chunk never blocks the authoritative upload', async () => {
		httpClientMock.put.mockReturnValue(throwError(() => ({ status: 500 })));
		const session = create();
		await session.start();
		session.pushChunk(new Blob([new Uint8Array(2 * 1024 * 1024)]));

		const file = finalFile();
		await expect(session.finish(file)).resolves.toBeDefined();
		expect(filesRepositoryMock.handleFileList$).toHaveBeenCalledWith([file], expect.objectContaining({ fileId: 'file-1' }));
	});

	it('finish throws if the final upload returns no file', async () => {
		filesRepositoryMock.handleFileList$.mockReturnValue(of([{ result: undefined }]));
		const session = create();
		await session.start();

		await expect(session.finish(finalFile())).rejects.toThrow();
	});

	it('throws if finish somehow races ahead of start (defensive contract check)', async () => {
		const session = create();

		await expect(session.finish(finalFile())).rejects.toThrow();
	});
});
