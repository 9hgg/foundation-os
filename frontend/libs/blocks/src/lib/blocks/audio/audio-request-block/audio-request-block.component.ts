import { CdkDrag, CdkDragDrop, CdkDragPlaceholder, CdkDragPreview, CdkDropList, moveItemInArray } from '@angular/cdk/drag-drop';
import { CdkMenu, CdkMenuItem, CdkMenuTrigger } from '@angular/cdk/menu';
import { CommonModule } from '@angular/common';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, effect, ElementRef, inject, OnDestroy, signal, untracked, ViewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { InterceptorSkipHeader } from '@foundation/auth/state';
import { ExportOption, ExportOptionKind } from '@foundation/canvas';
import { EntityFile } from '@foundation/files/models';
import { convertToUrl, FilesRepository } from '@foundation/files/state';
import { UploadButtonComponent } from '@foundation/files/ui';
import { TwCamIcon, TwCamOffIcon, TwCancelIcon, TwChevronLeftIcon, TwCogIcon, TwDeleteIcon, TwDocumentIcon, TwDownloadIcon, TwEnabledCheckedIcon, TwEnabledEmptyIcon, TwMicIcon, TwMicOffIcon, TwPaletteIcon, TwScreenCaptureIcon, TwStopIcon, TwUploadIcon } from '@foundation/icons';
import { DurationIndicatorComponent, PlayButtonComponent, SubtitleLoaderComponent } from '@foundation/media/play/ui';
import { ASPECT_RATIO_CONSTRAINTS, DEFAULT_RECORDING_PROPS, MediaModeOptions, RecorderService, RecordingProps, VideoAspectRatio } from '@foundation/media/record/recorder';
import { QuestionMarkHelpComponent } from '@foundation/notification';
import { TranslationService } from '@foundation/translations/services';
import { getContrastingColor } from '@foundation/utils';
import { cloneDeep, mean } from 'lodash-es';
import { catchError, EMPTY, map, of } from 'rxjs';
import { filter, finalize, switchMap, take, tap } from 'rxjs/operators';
import { v4 as uuidv4 } from 'uuid';
import { MotherComponent } from '../../../mother.component';

// The chunk size must be a multiple of 256 KiB (256 x 1024 bytes)
// https://cloud.google.com/storage/docs/resumable-uploads#python
const MULTIPLE_BLOB_SIZE = 256 * 1024; // n*256kb (5 -> 1mb)
const MINIMAL_BLOB_SIZE = 1 * MULTIPLE_BLOB_SIZE; // n*256kb

interface Chunk {
	chunkIndex: number;
	blob: Blob | null;
	start: number;
	end: number;
	uploaded: boolean;
	beingUploaded: boolean;
	isLast: boolean;
	fileSize: '*' | number;
}

interface Recording {
	id: string;
	date: number;
	entityFileId: string;
	selected: boolean;
	deleted?: boolean;
	alternative?: string | null;
}

@Component({
	selector: 'lib-audio-request-block',
	standalone: true,
	imports: [
		//
		CommonModule,
		FormsModule,
		UploadButtonComponent,
		CdkMenu,
		CdkMenuItem,
		CdkDropList,
		CdkDrag,
		CdkMenuTrigger, // icons
		TwMicIcon,
		TwCamIcon,
		TwUploadIcon,
		TwScreenCaptureIcon,
		TwCancelIcon,
		TwPaletteIcon,
		TwEnabledEmptyIcon,
		TwCogIcon,
		TwEnabledCheckedIcon,
		TwDeleteIcon,
		SubtitleLoaderComponent,
		DurationIndicatorComponent,
		PlayButtonComponent,
		TwDownloadIcon,
		TwMicOffIcon,
		TwCamOffIcon,
		TwDocumentIcon,
		TwStopIcon,
		// TrackScrollDirective, => does not disappear if scroll length to short at this time
		QuestionMarkHelpComponent,
		TwChevronLeftIcon,
		CdkDragPreview,
		CdkDragPlaceholder,
	],
	templateUrl: './audio-request-block.component.html',
	styleUrl: './audio-request-block.component.css',
	changeDetection: ChangeDetectionStrategy.OnPush,
	host: {
		'(window:keydown.shift)': 'onShiftDown()',
		'(window:keyup.shift)': 'onShiftUp()',
	},
})
export class AudioRequestBlockComponent extends MotherComponent implements OnDestroy {
	private _filesRepository = inject(FilesRepository);
	private _httpClient = inject(HttpClient);
	private _translationService = inject(TranslationService);

	//#region shift handler
	public shiftPressed = signal<boolean>(false);

	onShiftDown() {
		this.shiftPressed.set(true);
	}

	onShiftUp() {
		this.shiftPressed.set(false);
	}
	//#endregion

	//#region block properties
	title = signal<string>('Get ready to record');
	acceptAudio = signal<boolean>(true);
	acceptVideo = signal<boolean>(false);
	acceptScreen = signal<boolean>(false);
	acceptScreenWithVideo = signal<boolean>(false);
	acceptUpload = signal<boolean>(true);
	advancedModeEnabled = signal<boolean>(true);
	displayTranscript = signal<boolean>(false);
	recordings = signal<Recording[]>([]);
	temporaryRecording = signal<(Partial<Recording> & { entityFileId: string; id: string }) | null>(null);
	maxDuration = signal<number>(60);
	openMicrophoneAutomatically = signal<boolean>(false);
	textColor = signal<string>('');
	textColorForced = computed(() => {
		let textColor = this.textColor();
		if (!textColor || textColor === 'transparent' || textColor === 'inherit') {
			// get color of interview
			textColor = this.canvasManager?.defaultTextColor ?? '#000000';
		}
		if (!textColor || textColor === 'transparent' || textColor === 'inherit') {
			// get color of interview
			textColor = '#000000';
		}
		return textColor;
	});

	textColorContrasted = computed(() => {
		return getContrastingColor(this.textColor());
	});

	backgroundColor = signal<string>('transparent');
	backgroundColorForced = computed(() => {
		let backgroundColor = this.backgroundColor();
		if (!backgroundColor || backgroundColor === 'transparent' || backgroundColor === 'inherit') {
			// get color of interview
			backgroundColor = this.canvasManager?.defaultBackgroundColor ?? '#ffffff';
		}
		if (!backgroundColor || backgroundColor === 'transparent' || backgroundColor === 'inherit') {
			// get color of interview
			backgroundColor = '#ffffff';
		}
		return backgroundColor;
	});
	backgroundColorContrasted = computed(() => {
		return getContrastingColor(this.backgroundColorForced());
	});

	borderColor = signal<string>('inherit');
	borderColorContrasted = computed(() => {
		return getContrastingColor(this.borderColor());
	});

	containerBackgroundColor = signal<string>(''); // Empty string for transparent by default
	containerBackgroundColorForced = computed(() => {
		let containerBgColor = this.containerBackgroundColor();
		if (!containerBgColor || containerBgColor === 'transparent' || containerBgColor === 'inherit') {
			// get color of interview
			containerBgColor = this.canvasManager?.defaultBackgroundColor ?? '#ffffff';
		}
		if (!containerBgColor || containerBgColor === 'transparent' || containerBgColor === 'inherit') {
			// get color of interview
			containerBgColor = '#ffffff';
		}
		return containerBgColor;
	});
	containerBackgroundColorContrasted = computed(() => {
		return getContrastingColor(this.containerBackgroundColorForced());
	});

	borderRadius = signal<string>('10px');
	buttonWidth = signal<string>('100px');
	buttonHeight = signal<string>('200px');
	defaultAspectRatio = signal<VideoAspectRatio>(VideoAspectRatio.ratio16_9);
	accept = computed<string>(() => {
		const acceptAudio = this.acceptAudio();
		const acceptVideo = this.acceptVideo();
		if (!acceptAudio && !acceptVideo) return 'audio/*, video/*';
		return `${acceptAudio ? 'audio/*' : ''}${acceptAudio && acceptVideo ? ', ' : ''}${acceptVideo ? 'video/*' : ''}`;
	});
	displayHelp = signal<boolean>(true);
	//#endregion

	//#region toolbar helpers
	colorPresets = [
		{ name: 'Emerald', background: '#10b981', text: '#ffffff' },
		{ name: 'Default', background: '#3b82f6', text: '#ffffff' },
		{ name: 'Rose', background: '#f43f5e', text: '#ffffff' },
		{ name: 'Amber', background: '#f59e0b', text: '#000000' },
		{ name: 'Purple', background: '#8b5cf6', text: '#ffffff' },
		{ name: 'Slate', background: '#64748b', text: '#ffffff' },
		{ name: 'Orange', background: '#ea580c', text: '#ffffff' },
		{ name: 'Teal', background: '#0d9488', text: '#ffffff' },
	];

	//#endregion

	//#region recorder properties
	private _audioContex?: AudioContext;
	private _analyserNode?: AnalyserNode;
	public get audioContex() {
		if (!this._audioContex) {
			this._audioContex = new AudioContext();
		}
		return this._audioContex;
	}
	public set audioContex(value) {
		this._audioContex = value;
	}
	public get analyserNode() {
		if (!this._analyserNode) {
			this._analyserNode = this.audioContex.createAnalyser();

			this._analyserNode.smoothingTimeConstant = 0.8;
			this._analyserNode.fftSize = 1024;
		}
		return this._analyserNode;
	}
	public set analyserNode(value) {
		this._analyserNode = value;
	}
	audioSourceNode?: MediaStreamAudioSourceNode;
	recordingProps = signal<RecordingProps>(DEFAULT_RECORDING_PROPS);
	isEverythingGranted = computed(() => {
		const props = this.recordingProps();
		const mode = this.mediaMode();

		if (mode === MediaModeOptions.video) {
			return props.cameraAccessGranted && props.microphoneAccessGranted;
		}
		if (mode === MediaModeOptions.screenCaptureAndVideo) {
			return props.cameraAccessGranted && props.microphoneAccessGranted;
		}
		if (mode === MediaModeOptions.screenCapture) {
			return props.microphoneAccessGranted;
		}
		if (mode === MediaModeOptions.audio) {
			return props.microphoneAccessGranted;
		}

		return false;
	});
	aspectRatioOptions = Object.entries(VideoAspectRatio).map(([, value]) => ({
		key: value,
		label: ASPECT_RATIO_CONSTRAINTS[value].label,
	}));
	mediaMode = signal<MediaModeOptions | 'upload' | null>(null);

	currentScreen = signal<'help' | 'tracks' | 'participate'>('tracks');
	chunks: Chunk[] = [];
	blobs: Blob[] = [];
	totalChunks = 0;
	uploadChunksContext: {
		fileName: string;
		fileType: string;
		resumableUploadUrl: string;
		entityFile: EntityFile;
	} | null = null;
	bytesIndex = 0;
	chunkIndex = 0;
	entityFileBeingUploaded: EntityFile | null = null;
	temporaryBlob: Blob | null = null;
	MediaModeOptions = MediaModeOptions;

	/** To keep track of who is recording, in case of multiple recorder available */
	recordingTargetName = signal<string | null>(null);
	@ViewChild('videoPreview') videoPreview?: ElementRef<HTMLVideoElement>;
	@ViewChild('audioMeter') audioMeter?: ElementRef<HTMLCanvasElement>;
	counter = signal(0);
	timeLeft = signal(3.99);
	counting = signal(false);
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	counterInterval?: any;
	timerDuration = signal(3);
	// Recorder service instance (it's not an angular service)
	_recorderService = new RecorderService();

	//#endregion

	// Final recording duration (persisted after recording stops)
	finalRecordingDuration = signal<number>(0);

	constructor() {
		super();
		// interactions
		this.enlistSignalForInteractionStorage(this.recordings);
		this.enlistSignalForInteractionStorage(this.temporaryRecording);

		// interview block details
		this.enlistSignalForBlockStorage(this.acceptAudio);
		this.enlistSignalForBlockStorage(this.acceptVideo);
		this.enlistSignalForBlockStorage(this.acceptScreen);
		this.enlistSignalForBlockStorage(this.acceptScreenWithVideo);
		this.enlistSignalForBlockStorage(this.acceptUpload);
		this.enlistSignalForBlockStorage(this.advancedModeEnabled);
		this.enlistSignalForBlockStorage(this.maxDuration);
		this.enlistSignalForBlockStorage(this.title);
		this.enlistSignalForBlockStorage(this.displayTranscript);
		this.enlistSignalForBlockStorage(this.textColor);
		this.enlistSignalForBlockStorage(this.backgroundColor);
		this.enlistSignalForBlockStorage(this.borderColor);
		this.enlistSignalForBlockStorage(this.containerBackgroundColor);
		this.enlistSignalForBlockStorage(this.borderRadius);
		this.enlistSignalForBlockStorage(this.buttonWidth);
		this.enlistSignalForBlockStorage(this.buttonHeight);
		this.enlistSignalForBlockStorage(this.defaultAspectRatio);
		this.enlistSignalForBlockStorage(this.timerDuration);
		this.enlistSignalForBlockStorage(this.displayHelp);
		this.enlistSignalForBlockStorage(this.openMicrophoneAutomatically);

		// // effect if "allows" are all disabled then enable audio
		// effect(() => {
		// 	if (!this.acceptAudio() && !this.acceptVideo() && !this.acceptScreen() && !this.acceptScreenWithVideo() && !this.acceptUpload()) {
		// 		this.acceptAudio.set(true);
		// 	}
		// });

		// effect to update default recording option if current selection becomes unavailable
		effect(() => {
			const enabledOptions = [];

			const acceptAudio = this.acceptAudio();
			if (acceptAudio) enabledOptions.push('audio');
			const acceptVideo = this.acceptVideo();
			if (acceptVideo) enabledOptions.push('video');
			const acceptScreen = this.acceptScreen();
			if (acceptScreen) enabledOptions.push('screen');
			const acceptScreenWithVideo = this.acceptScreenWithVideo();
			if (acceptScreenWithVideo) enabledOptions.push('screenWithVideo');
			const acceptUpload = this.acceptUpload();
			if (acceptUpload) enabledOptions.push('upload');

			if (enabledOptions.length === 0) {
				this.acceptAudio.set(true);
			}

			const currentScreen = this.currentScreen();

			if (currentScreen != 'participate') {
				// reset the preventAutoRestart
				this.preventAutoRestart.set(false);
				// this._recorderService.stopRecording();
				return;
			}

			// if media mode is set : return media mode
			const mediaMode = this.mediaMode();
			if (mediaMode) {
				console.log('[RecordActions](effect) - media mode is set:', mediaMode);
				return;
			}
			if (!this.openMicrophoneAutomatically() || this.preventAutoRestart()) return;
			console.log('[RecordActions](effect) - no media mode is set');
			// if unset but we only one option: return the option
			const options: Record<string, { accepted: boolean; option: MediaModeOptions | 'upload' }> = {
				//
				audio: { accepted: acceptAudio, option: MediaModeOptions.audio },
				video: { accepted: acceptVideo, option: MediaModeOptions.video },
				screen: { accepted: acceptScreen, option: MediaModeOptions.screenCapture },
				screenWithVideo: { accepted: acceptScreenWithVideo, option: MediaModeOptions.screenCaptureAndVideo },
				upload: { accepted: acceptUpload, option: 'upload' },
			};
			const availableOptions: (MediaModeOptions | 'upload')[] = Object.entries(options)
				.filter(([, value]) => value.accepted)
				.map(([, value]) => value.option);

			let forcedOption: MediaModeOptions | 'upload' | null = null;
			if (availableOptions.length === 1) {
				console.log('[RecordActions](effect) - media selected option is:', availableOptions[0]);

				forcedOption = availableOptions[0];
			} else {
				console.log('[RecordActions](effect) - media multiple options available:', availableOptions);
			}
			if (forcedOption != null && forcedOption !== 'upload') {
				console.log('[RecordActions](effect) - set media mode to:', forcedOption);
				this.setMediaMode(forcedOption);
			} else {
				console.log('[RecordActions](effect) - no media forced option  set');
			}
		});

		// subscribe to the recording props from recording repository
		this._recorderService.recordingProps$$$
			.pipe(
				takeUntilDestroyed(),
				tap((props) => {
					if (props.recordingState !== this.recordingProps().recordingState) {
						this._processNewRecordingState(props);
					}

					this.recordingProps.set(props);

					if (props.recordingState == 'recording') {
						this.counting.set(false);
					}
				})
			)
			.subscribe();

		effect(async () => {
			const currentScreen = this.currentScreen();
			const isEverythingGranted = untracked(this.isEverythingGranted);
			if (currentScreen == 'participate' && isEverythingGranted) {
				console.log('[RecordActions](effect)(setMediaMode) - launching devices as everything is granted');
				await this.launchDevices('(constructor)');
			}
		});
	}

	override ngOnDestroy() {
		super.ngOnDestroy();
	}

	override destructor() {
		console.log('[AudioRequestBlockComponent](destructor) - cleaning up');

		this.stopRecording();
		this.stopRecordingTimer();
		if (this.counterInterval) {
			clearInterval(this.counterInterval);
		}
	}

	static override getExportOptions(): ExportOption<ExportOptionKind>[] {
		const audioRequestBlockRecordingsAsUrls: ExportOption<'media'> = {
			id: 'audio-request-block-recordings-as-urls',
			kind: 'media',
			title: 'Recordings as URLs',
			activeByDefault: true,
			displayedByDefault: true,
			description: 'Export the recordings as URLs',
			perInteraction: true,
			fn(step, block, interaction, ownerId) {
				if (!interaction) return [];
				const interviewId = ownerId;
				const propertyId = 'recordings';
				const propertyKey = `${interviewId}.${step.id}.${block.id}.${propertyId}`;
				const recordings = interaction.config[propertyKey] as Recording[] | null;
				if (!recordings) return [];
				return recordings
					.filter((recording: Recording) => recording.selected && !recording.deleted)
					.map((recording: Recording) => {
						return {
							id: recording.id,
							title: recording.date,
							entityFileId: recording.entityFileId,
							link: convertToUrl(recording.entityFileId, undefined, true),
						};
					});
			},
		};

		return [audioRequestBlockRecordingsAsUrls];
	}

	//#region CHUNK UPLOAD

	private _clearUploadChunksContext() {
		this.uploadChunksContext = null;
		this.chunks = [];
		this.totalChunks = 0;
		this.bytesIndex = 0;
		this.temporaryBlob = null;
	}

	private _createUploadChunksContext$(fileType: RecordingProps['selectedFormat']) {
		if (!fileType) {
			console.warn('No selected format');
			return of(null);
		}

		// if (1) {
		// 	console.warn('no recover yet');
		// 	return of(null);
		// }

		this._clearUploadChunksContext();

		let fileExtension = fileType.split('/')[1];
		if (fileExtension.indexOf(';') !== -1) {
			// extended mimetype, e.g. 'video/webm;codecs=vp8,opus'
			fileExtension = fileExtension.split(';')[0];
		}
		const title = this.title() ?? '';
		const fileKind = fileType.split('/')[0];
		const filename = Date.now() + '_' + fileKind;
		const fileFullName = (title ? title + '_' : '') + filename + '.' + fileExtension;

		return this._filesRepository.getResumableUploadUrl$(fileFullName, fileType, undefined, 'original').pipe(
			map((res) => {
				if (res.result?.data && res.result.data.uploadUrl) {
					this.uploadChunksContext = {
						fileName: filename,
						fileType: fileType,
						resumableUploadUrl: res.result.data.uploadUrl,
						entityFile: res.result.data,
					};
					this.entityFileBeingUploaded = res.result.data;

					this.temporaryRecording.set({
						id: uuidv4(),
						date: Date.now(),
						entityFileId: this.entityFileBeingUploaded.id,
						alternative: 'original',
					});

					return this.uploadChunksContext;
				} else {
					console.log('No resumable upload url');

					return null;
				}
			})
		);
	}

	private _uploadNextChunk$() {
		if (!this.uploadChunksContext) return EMPTY;

		const chunkIndex = this.chunks.findIndex((chunk) => !chunk.uploaded && !chunk.beingUploaded);

		if (chunkIndex === -1) {
			console.log('No chunk to upload');
			return EMPTY;
		}

		const chunk = this.chunks[chunkIndex];
		this.chunks[chunkIndex].beingUploaded = true;

		console.log('Uploading chunk:', chunk);
		const headers = new HttpHeaders() //
			.set(InterceptorSkipHeader, '')
			.set('Content-Type', this.uploadChunksContext.fileType);
		// .set('Content-Range', `bytes ${chunk.start}-${chunk.end}/${chunk.fileSize}`);

		return this._filesRepository.getChunkUploadUrl$(this.uploadChunksContext.entityFile.id, 'original', chunk.start, chunk.end).pipe(
			switchMap((r) => {
				console.log('[_uploadChunks$] Chunk upload URL received:', r);
				if (r.result) {
					return this._httpClient.put(r.result.uploadUrl.replace(':4200', ':8000'), chunk.blob, {
						// reportProgress: true,
						// observe: 'events',
						headers,
					});
				}
				return EMPTY;
			}),
			catchError((err, caught) => {
				if (err.status === 308) {
					// 308 is not an error, it means the
					// chunk was uploaded and the upload is incomplete
					console.log('[_uploadChunks$] Intermediate chunk uploaded:', { err, caught });
					this.chunks[chunkIndex].uploaded = true;
					this.chunks[chunkIndex].beingUploaded = false;
					this.chunks[chunkIndex].blob = null;
					return EMPTY;
				}
				// this.chunks[chunkIndex].uploaded = false;
				this.chunks[chunkIndex].beingUploaded = false;
				console.error('[_uploadChunks$] Error while uploading chunk:', { err, caught });
				throw new Error('Error while uploading chunk');
			}),
			tap((res) => {
				console.log('[_uploadChunks$] Chunk uploaded successfully:', res);
				this.chunks[chunkIndex].uploaded = true;
				this.chunks[chunkIndex].beingUploaded = false;
				this.chunks[chunkIndex].blob = null;
			})
		);
	}

	/**
	 * Called when a new blob is available from the recorder
	 * @param newRecordingBlob The new recording blob
	 */
	private _processNewBlobAvailableFromRecorder(newRecordingBlob: Blob) {
		// if (1) return;
		console.log('[blobs] newRecordingBlob available from recorder:', newRecordingBlob);
		this.blobs.push(newRecordingBlob);
		this._loopForChunks();
	}

	private _processNewRecordingState(recordingProps: RecordingProps) {
		const state = recordingProps.recordingState;

		if (state === 'recording') {
			this._createUploadChunksContext$(recordingProps.selectedFormat).subscribe((context) => {
				console.log('[state] Upload chunks new context:', context);
				this.uploadChunksContext = context;
				this.lastLoopTime = Date.now();
				this._loopForChunks();
			});
		}
	}

	lastLoopTime: number | null = null;
	private _loopForChunks() {
		if (!this.uploadChunksContext) {
			console.log('[chunks] No uploadChunksContext, we cannot loop for chunks');

			return;
		}
		console.log('[chunks] Loop for chunks', this.chunks.length, '/', this.totalChunks, '|', this.blobs.length);

		const recordingState = this.recordingProps().recordingState;

		if (recordingState === 'stopped' && this.blobs.length == 0 && this.temporaryBlob == null) {
			console.log('[chunking] recordingState === stopped, no blobs to upload');
		} else if (recordingState === 'stopped' && (this.blobs.length > 0 || this.temporaryBlob)) {
			// we must upload what is in the temporary blob and what's left

			const leftBlobs = this.blobs.length;
			const finalBlob = new Blob([...(this.temporaryBlob ? [this.temporaryBlob] : []), ...this.blobs.splice(0, this.blobs.length)]);

			console.log('[chunking] recordingState === stopped, upload the temporaryBlob with the last blobs on top (', leftBlobs, ')');
			const chunk: Chunk = {
				blob: finalBlob,
				start: this.bytesIndex,
				end: this.bytesIndex + finalBlob.size - 1,
				uploaded: false,
				beingUploaded: false,
				chunkIndex: this.chunkIndex++,
				isLast: true,
				fileSize: this.bytesIndex + finalBlob.size,
			};
			this.chunks.push(chunk);
			this.totalChunks++;
			this.bytesIndex = this.bytesIndex + finalBlob.size;
			this.temporaryBlob = null;
		} else if (this.blobs.length > 0) {
			console.log('[chunking] blobs.length > 0', this.blobs.length);

			if (this.temporaryBlob) {
				console.log('[chunking] adding ' + this.blobs.length + ' blobs to existing temporaryBlob');
				this.temporaryBlob = new Blob([this.temporaryBlob, ...this.blobs.splice(0, this.blobs.length)]);
			} else {
				console.log('[chunking] creating new temporaryBlob with ' + this.blobs.length + ' blobs');
				this.temporaryBlob = new Blob(this.blobs.splice(0, this.blobs.length));
			}

			// check size is a multiple of 256kb
			const size = this.temporaryBlob.size;

			const weAreRecordingVideo = this.recordingProps().selectedFormat === 'video';

			// we create a chunk every 3 seconds (if we have some bytes) OR if we have enough data (5mb for video, 1mb for audio)
			if (size >= (weAreRecordingVideo ? 5 : 1) * MINIMAL_BLOB_SIZE || (this.lastLoopTime && Date.now() - this.lastLoopTime > 3000 && size > 0)) {
				this.lastLoopTime = Date.now();
				// const remainder = size % MINIMAL_BLOB_SIZE;
				// const newSize = size - remainder;
				const newSize = size;
				console.log('[chunking] we can create a chunk of size:', newSize);
				const chunk: Chunk = {
					blob: this.temporaryBlob.slice(0, newSize),
					start: this.bytesIndex,
					end: this.bytesIndex + newSize - 1,
					uploaded: false,
					beingUploaded: false,
					chunkIndex: this.chunkIndex++,
					isLast: false,
					fileSize: '*',
				};

				console.log('[chunking] created new chunk:', chunk);

				this.chunks.push(chunk);
				this.totalChunks++;
				this.bytesIndex = this.bytesIndex + newSize;
				// keep the remainder
				this.temporaryBlob = this.temporaryBlob.slice(newSize);
				console.log('[chunking] new chunk:', { newChunk: chunk, newTemporaryBlobSize: this.temporaryBlob.size });
			} else {
				console.log('[chunking] not enough data to create a chunk, keep the temporaryBlob at size: ' + size);
			}
		} else {
			console.log('[chunking] blobs.length === 0');
		}

		// get first chunk
		// const chunk = this.chunks.shift();
		if (
			//
			this.chunks.some((chunk) => !chunk.uploaded) &&
			!this.chunks.some((chunk) => chunk.beingUploaded)
		) {
			console.log('[chunks] Some chunks are not uploaded yet, and we are not uploading anything');

			if (this.chunks.length > 1) {
				console.log('[chunks] We have more than one chunk (' + this.chunks.filter((c) => c.uploaded).length + '/' + this.chunks.length + ')');
			}

			// // merge all chunks into one
			// const finalBlob = new Blob(
			// 	this.chunks.filter((chunk) => chunk.blob && !chunk.beingUploaded && !chunk).map((chunk) => chunk.blob)
			// );

			this._uploadNextChunk$().subscribe((data) => {
				console.log('[chunks] Chunk uploaded:', data);
				// this.loopForChunks();
			});
		} else if (
			//
			this.chunks.some((chunk) => !chunk.uploaded) &&
			this.chunks.some((chunk) => chunk.beingUploaded)
		) {
			console.log('[chunks] Some chunks are being uploaded, we will loop later');
			setTimeout(() => {
				this._loopForChunks();
			}, 1000);
		} else {
			console.log('[chunks] All chunks are uploaded at this point');
		}
	}

	//#endregion CHUNK UPLOAD

	//#region file management

	/**
	 * Called when stopping recording with final file
	 */
	private _processFileAvailableFromRecorder(file: File, duration?: number) {
		console.log('File available from recorder, ready to be uploaded:', file, this.entityFileBeingUploaded);

		let options: any;

		if (this.entityFileBeingUploaded) {
			options = {
				fileId: this.entityFileBeingUploaded.id,
				duration: duration ?? this.entityFileBeingUploaded.extra?.duration,
			};
		} else {
			options = {};
		}

		this._filesRepository
			.handleFileList$([file], options)
			.pipe(
				tap((r) => {
					console.log('you should save this file id as an interaction:', r);

					const first = r[0];

					if (!first) {
						console.log('No updated file result');
						return;
					}

					const updatedFile = first.result?.file;

					if (!updatedFile) {
						console.log('No updated file');
						return;
					}

					this._addEntityFileToRecordings(updatedFile.id);
					this.temporaryRecording.set(null);
					this.currentScreen.set('tracks');
				})
			)
			.subscribe();
	}

	private _addEntityFileToRecordings(entityFileId: string, recordingDetails?: Partial<Recording>) {
		const currentRecordings = this.recordings();
		const onlyOneIsSelected = currentRecordings.filter((r) => r.selected && !r.deleted).length === 1;
		const newOneIsSelected = recordingDetails?.selected ?? true;

		// if only one was selected we unselect it in favor of the new one (if selected)
		const updatedRecordings: Recording[] = currentRecordings.map((recording) => ({
			...recording,
			id: recording.id ?? uuidv4(), // backward compatibility
			date: recording.date ?? Date.now(), // backward compatibility
			recording: false,
			selected: onlyOneIsSelected && newOneIsSelected ? false : recording.selected,
		}));

		const newRecording: Recording = {
			id: uuidv4(),
			date: Date.now(),
			entityFileId: entityFileId,
			selected: true,
			...recordingDetails,
		};

		updatedRecordings.push(newRecording);
		this.recordings.set(updatedRecordings);
	}

	/**
	 * Called when files are uploaded via the upload button
	 * @param uploadedFiles
	 */
	public handleUploadedFiles(uploadedFiles: (EntityFile | undefined)[]) {
		console.log('[RecordActions] Files uploaded:', uploadedFiles);

		// Filter out undefined files and process the first valid file
		const validFiles = uploadedFiles.filter((file): file is EntityFile => file !== undefined);
		if (validFiles.length > 0) {
			const uploadedFile = validFiles[0];

			const currentRecordings = this.recordings();
			// mark all recordings as not selected and append the new one
			const newRecordings = currentRecordings.map((recording) => ({
				...recording,
				id: recording.id ?? uuidv4(), // backward compatibility
				date: recording.date ?? Date.now(), // backward compatibility
				selected: false,
			}));
			newRecordings.push({
				id: uuidv4(),
				date: Date.now(),
				entityFileId: uploadedFile.id,
				selected: true,
			});
			this.recordings.set(newRecordings);
			this.currentScreen.set('tracks');
		}
	}

	//#endregion file management

	//#region TRACKS

	nbTrackSelected = computed(() => {
		return this.recordings().filter((recording) => recording.selected && !recording.deleted).length;
	});
	nbTrackAvailable = computed(() => {
		return this.recordings().filter((recording) => !recording.deleted).length;
	});

	drop(event: CdkDragDrop<any>) {
		console.log('drop', event);
		const recordings = cloneDeep(this.recordings());

		moveItemInArray(recordings, event.previousIndex, event.currentIndex);

		this.recordings.set(recordings);
	}

	private _i18n_deleteSentence = this._translationService.prep('Are you sure you want to delete this file?');
	public deleteTrack(event: MouseEvent | PointerEvent, recordingId: string) {
		// alt key is pressed completely remove from recordings
		if (event.altKey) {
			this.recordings.update((recordings) => {
				return recordings.filter((recording) => recording.id !== recordingId);
			});
			return;
		}

		if (this.shiftPressed()) {
			const recordings = cloneDeep(this.recordings());
			const index = recordings.findIndex((recording) => recording.id === recordingId);
			// remove it
			// if (index !== -1) {
			// 	recordings.splice(index, 1);
			// 	this.recordings.set(recordings);
			// }

			// mark it as deleted
			if (index !== -1) {
				recordings[index].deleted = !recordings[index].deleted;
				this.recordings.set(recordings);
			}
			return;
		}

		this._notificationService
			.confirm(this._i18n_deleteSentence())
			.closed.pipe(
				tap((confirmation) => {
					if (confirmation) {
						const recordings = cloneDeep(this.recordings());
						const index = recordings.findIndex((recording) => recording.id === recordingId);
						// remove it
						// if (index !== -1) {
						// 	recordings.splice(index, 1);
						// 	this.recordings.set(recordings);
						// }

						// mark it as deleted
						if (index !== -1) {
							recordings[index].deleted = !recordings[index].deleted;
							this.recordings.set(recordings);
						}
					}
				})
			)
			.subscribe();
	}

	public toggleTrackSelection(recording: Recording) {
		const recordings = cloneDeep(this.recordings());
		const index = recordings.findIndex((rec) => rec.id === recording.id);
		if (index !== -1) {
			recordings[index].selected = !recordings[index].selected;
			this.recordings.set(recordings);
		}
	}

	public downloadTrack(recording: Recording) {
		const url = convertToUrl(recording.entityFileId, recording.alternative ?? undefined, true);
		window.open(url, '_blank');
	}

	tryingToRecover = signal<boolean>(false);
	public tryRecuperation(recording: Partial<Recording> & { entityFileId: string; id: string }) {
		this._notificationService
			.confirm("This recording was interrupted and didn't finish properly.<br><br>To prevent data loss, we automatically save recordings in progress. Depending on your network connection and recording quality, we may have already received most of your content.<br><br>Would you like to try recovering this recording?", 'Recover Recording?', { cancelButtonText: 'Cancel', confirmButtonText: 'Recover' })
			.closed.pipe(
				tap((confirmation) => {
					if (confirmation) {
						this.tryingToRecover.set(true);

						this._filesRepository.recoverFromChunkUpload$(recording.entityFileId, 'original').subscribe({
							next: (response) => {
								console.log('Updated file after thumbnail refresh:', response);

								if (response.error) {
									this._notificationService.snackError('Failed to recover recording: ' + response.error.title);
									this.tryingToRecover.set(false);
									return;
								}

								if (response.result.taskId) {
									let taskCount = 1;
									this._filesRepository
										.getTaskProgress$(response.result.taskId)
										.pipe(
											tap((tp) => {
												console.log('Task progress polling:', { progress: tp?.progress, pollingCount: tp?.pollingCount, taskCount: tp?.taskCount });
												if (tp && tp.taskCount > taskCount) {
													console.log('New task detected:', { taskId: tp.id, taskCount: tp.taskCount });

													taskCount = tp.taskCount;
													// we force file pulling to get it's last version while tasks are ongoing
													this._filesRepository.store
														.getObjectById$$$(recording.entityFileId, true, true)
														.pipe(
															filter((lastFile): lastFile is EntityFile => !!lastFile),
															take(1),
															tap((lastFile) => {
																console.log('File updated:', lastFile);
															})
														)
														.subscribe();
												}
											}),

											finalize(() => {
												console.log('Task progress polling completed for file', recording.entityFileId);
												setTimeout(() => {
													this._filesRepository.store
														.getObjectById$$$(recording.entityFileId, true, true)
														.pipe(
															filter((lastFile): lastFile is EntityFile => !!lastFile),
															take(1),
															tap((lastFile) => {
																console.log('File updated after finalize:', lastFile);
																if (lastFile.inStorage) {
																	// this._updateRecordingDetails(recording.id, { entityFileId: response.result?.file.id, alternative: null });
																	this._addEntityFileToRecordings(recording.entityFileId);
																	this.temporaryRecording.set(null);
																} else {
																	this._notificationService.snackError('Failed to recover recording: file not recovered.');
																}
																this.tryingToRecover.set(false);
															})
														)
														.subscribe();
												}, 1000);
											})
										)
										.subscribe();
								}
							},
							error: (error) => {
								this._notificationService.snackError('Failed to refresh thumbnail: ' + error.message);
								this.tryingToRecover.set(false);
							},
						});
					} else {
						this.tryingToRecover.set(false);
					}
				})
			)
			.subscribe();
	}

	//#endregion TRACKS

	//#region BLOCK TOOLBAR details

	// Color preset methods
	public isPresetActive(preset: { background: string; text: string }): boolean {
		const currentBg = this.backgroundColor();
		const currentText = this.textColor();
		return currentBg === preset.background && currentText === preset.text;
	}

	public applyColorPreset(preset: { background: string; text: string }): void {
		this.backgroundColor.set(preset.background);
		this.textColor.set(preset.text);
	}

	//#endregion TOOLBAR details

	//#region recorder actions

	/**
	 * Stop the recording timer
	 */
	private stopRecordingTimer() {
		// Save the final duration from the service before it resets
		const currentDuration = this.recordingProps().recordedDuration || 0;
		this.finalRecordingDuration.set(currentDuration);
	}

	/**
	 * Stop current media streams to free up resources
	 */
	private stopRenderingStreams() {
		// Stop video preview stream
		if (this.videoPreview?.nativeElement.srcObject) {
			const stream = this.videoPreview.nativeElement.srcObject as MediaStream;
			stream.getTracks().forEach((track) => {
				track.stop();
			});
			this.videoPreview.nativeElement.srcObject = null;
		}
		// Disconnect audio source
		if (this.audioSourceNode) {
			this.audioSourceNode.disconnect();
			this.audioSourceNode = undefined;
		}
	}

	/**
	 * Launch browser granting procedure for video devices
	 */
	public async requestCameraAccess() {
		await this._recorderService.listVideoDevices({
			removeMicBrowser: true,
			canAskForPermission: true,
			includeAudio: false,
		});
		if (this.isEverythingGranted()) {
			console.log('[RecordActions](requestCameraAccess) - launching devices as everything is granted');
			await this.launchDevices('(requestCameraAccess)');
		}
	}

	/**
	 * Launch browser granting procedure for audio devices
	 */
	public async requestMicrophoneAccess() {
		await this._recorderService.listAudioDevices({ removeMicBrowser: true, canAskForPermission: true });
		if (this.isEverythingGranted()) {
			console.log('[RecordActions](requestMicrophoneAccess) - launching devices as everything is granted');
			await this.launchDevices('(requestMicrophoneAccess)');
		}
	}

	/**
	 * Allow to switch between audio or video recording
	 * @param mediaMode
	 */
	public async setMediaMode(mediaMode: MediaModeOptions | null) {
		// Stop current streams before switching modes
		this.stopRenderingStreams();

		this.mediaMode.set(mediaMode);
		this._recorderService.setRecordingProps({
			mediaMode,
		});
		if (this.isEverythingGranted()) {
			await this.launchDevices('(setMediaMode)');
		}
	}

	public async launchDevices(title: string) {
		console.log(`[RecordActions](launchDevices) - ${title}`);

		if (this.currentScreen() != 'participate') {
			console.log('[RecordActions](launchDevices) - not in participate screen');
			return;
		}
		console.log('[RecordActions](launchDevice)');

		// Stop any existing streams first to avoid conflicts
		this.stopRenderingStreams();

		await this._recorderService.launchDevices((stream: MediaStream) => {
			if (this.videoPreview) {
				// we directly use the result of the recorder as the display input
				this.videoPreview.nativeElement.srcObject = stream;
				this.videoPreview.nativeElement.muted = true;
				// this.videoPreview.nativeElement.play();
			}
			if (this.audioMeter) {
				const canvaWidth = this.audioMeter.nativeElement.width;
				const canvaHeight = this.audioMeter.nativeElement.height;

				if (this.audioSourceNode) {
					this.audioSourceNode.disconnect();
					this.audioSourceNode = undefined;
				}
				this.audioSourceNode = this.audioContex.createMediaStreamSource(stream);
				this.audioSourceNode.connect(this.analyserNode);

				const canvasContext = this.audioMeter.nativeElement.getContext('2d');

				if (canvasContext) {
					// change color
					canvasContext.fillStyle = this.textColorForced();
					// add opacity
					// canvasContext.globalAlpha = 0.5;
				}

				const lastValues = Array(300);
				const rectWidth = canvaWidth / lastValues.length;

				const draw = () => {
					requestAnimationFrame(draw);
					if (!this.analyserNode) return;
					const frequencyData = new Uint8Array(this.analyserNode.frequencyBinCount);
					this.analyserNode.getByteFrequencyData(frequencyData);
					const averageFrequency = mean(frequencyData);

					if (canvasContext) {
						canvasContext.clearRect(0, 0, canvaWidth, canvaHeight);
						canvasContext.fillStyle = this.textColorForced();

						lastValues.splice(0, 1);
						lastValues.push(Math.min(canvaHeight, Math.max((averageFrequency / 100) * canvaHeight, 1)));
						for (let index = 0; index < lastValues.length; index++) {
							const value = lastValues[index];
							canvasContext.fillRect(index * rectWidth, (canvaHeight - value) / 2, rectWidth, value);
						}
					}
				};

				draw();
			}
		}, this.cancelCurrentRecording.bind(this));
	}

	public async askForAudioPermissions() {
		await this._recorderService.listAudioDevices({ removeMicBrowser: true, canAskForPermission: true }, this.cancelCurrentRecording.bind(this));
	}

	public updateAudioDevice(audioDeviceValue: MediaDeviceInfo) {
		this._recorderService.setRecordingProps({
			selectedAudioDevice: audioDeviceValue,
		});

		if (this.isEverythingGranted()) {
			console.log('[RecordActions](updateAudioDevice) - launching devices as everything is granted');

			this.launchDevices('(updateAudioDevice)');
		}
	}

	public async askForVideoPermissions() {
		await this._recorderService.listVideoDevices({ removeMicBrowser: true, canAskForPermission: true, includeAudio: false }, this.cancelCurrentRecording.bind(this));
	}

	public async updateVideoDevice(videoDeviceValue: MediaDeviceInfo) {
		this._recorderService.setRecordingProps({
			selectedVideoDevice: videoDeviceValue,
		});

		if (this.isEverythingGranted()) {
			console.log('[RecordActions](updateVideoDevice) - launching devices as everything is granted');
			this.launchDevices('(updateVideoDevice)');
		}
	}

	preventAutoRestart = signal<boolean>(false);
	public cancelCurrentRecording(stopStreams: boolean = false) {
		console.log('[RecordActions] Canceling current recording and stopping all media streams');

		if (stopStreams) {
			// If stopStreams is true, we stop all current media streams
			this.preventAutoRestart.set(true);
		}

		// Stop recording if in progress
		this._recorderService.cancelRecording();
		this._cancelRecordCounter();

		// Stop all current media streams
		this.stopRenderingStreams();

		// Reset media mode
		this.mediaMode.set(null);
		this.temporaryRecording.set(null);
	}

	/**
	 * called by the record button
	 * when the countdown is reached the change of recording state will triggers the creation of new "Recording"
	 * @returns
	 */
	public toggleRecordCounter() {
		if (this.counting()) {
			console.log('[RecordActions] Stopping record counter as it was already counting');
			this._cancelRecordCounter();
			return;
		}
		this.counter.set(0);
		this.counting.set(true);
		const recordingTargetName = this.blockId || 'default-recording';
		this.recordingTargetName.set(recordingTargetName);
		console.log('Using recording target name:', recordingTargetName);
		if (!recordingTargetName) {
			console.warn('No recording target name provided.');
			this._cancelRecordCounter();
			return;
		}

		this.counterInterval = setInterval(() => {
			this.counter.update((c) => c + 1);
			this.timeLeft.set(Math.ceil((this.timerDuration() * 10 - this.counter()) / 10));

			if (this.counter() >= this.timerDuration() * 10) {
				this._recorderService.startRecording(
					recordingTargetName,
					(chunk: Blob) => {
						this._processNewBlobAvailableFromRecorder(chunk);
					},
					this.cancelCurrentRecording.bind(this)
				);
				this._cancelRecordCounter();
			} else {
				console.log('[RecordActions] Counting down:', this.counter(), '/', this.timerDuration() * 10);
			}
		}, 100);
	}

	private _cancelRecordCounter() {
		clearInterval(this.counterInterval);
		this.counter.set(0);
		this.counting.set(false);
		this.timeLeft.set(this.timerDuration());
	}

	public stopRecording() {
		console.log('[RecordActions] Stopping recording');

		this._recorderService.stopRecording((file, recordingTargetName, recordingDuration) => {
			console.log('[RecordActions](callback) file, recordingTargetName', file, recordingTargetName, recordingDuration);

			if (file) {
				this._processFileAvailableFromRecorder(file, recordingDuration);
			} else {
				console.warn('[RecordActions] No file available after stopping recording');
			}
		});
	}

	/**
	 * Pause the current recording
	 */
	public pauseRecording() {
		console.log('[RecordActions] Pausing recording');
		this._recorderService.pauseRecording();
	}

	/**
	 * Resume a paused recording
	 */
	public resumeRecording() {
		console.log('[RecordActions] Resuming recording');
		this._recorderService.resumeRecording();
	}

	public async setAspectRatio(aspectRatio: VideoAspectRatio) {
		this._recorderService.setAspectRatio(aspectRatio);
		if (this.isEverythingGranted()) {
			console.log('[RecordActions](setAspectRatio) - launching devices as everything is granted');
			await this.launchDevices('(setAspectRatio)');
		}
		console.log('[RecordActions] Aspect ratio updated - relaunch devices if needed');
	}

	public getAspectRatioLabel(aspectRatio: VideoAspectRatio): string {
		return ASPECT_RATIO_CONSTRAINTS[aspectRatio]?.label || aspectRatio;
	}

	/**
	 * Start recording when all permissions are granted
	 */
	public startRecording() {
		console.log('[AudioRequestBlock] Starting recording...');
		this.toggleRecordCounter();
	}

	/**
	 * Format recording time for display (MM:SS)
	 */
	formatRecordingTime(): string {
		const recordingState = this.recordingProps().recordingState;
		const serviceDuration = this.recordingProps().recordedDuration || 0;

		// If currently recording, show live duration from service
		if (recordingState === 'recording') {
			const minutes = Math.floor(serviceDuration / 60);
			const seconds = Math.floor(serviceDuration % 60);
			return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
		}

		// If recording just stopped, show final duration
		if (recordingState === 'stopped' && this.finalRecordingDuration() > 0) {
			const elapsed = this.finalRecordingDuration();
			const minutes = Math.floor(elapsed / 60);
			const seconds = Math.floor(elapsed % 60);
			return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
		}

		// Default case - show service duration or zero
		const minutes = Math.floor(serviceDuration / 60);
		const seconds = Math.floor(serviceDuration % 60);

		return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
	}

	/**
	 * Cancel the countdown and reset to ready state
	 */
	cancelCountdown() {
		this.counting.set(false);
		if (this.counterInterval) {
			clearInterval(this.counterInterval);
		}
	}

	//#endregion recorder actions
}
