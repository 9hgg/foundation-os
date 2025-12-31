import { TwArrowDropDownIcon, TwCamIcon, TwCamOffIcon, TwCancelIcon, TwDeleteIcon, TwLockOpenIcon, TwMicIcon, TwMicOffIcon, TwScreenCaptureIcon, TwStopIcon, TwUploadIcon } from '@foundation/icons';
import { DEFAULT_RECORDING_PROPS, MediaModeOptions, RecorderService, RecordingProps, VideoAspectRatio, ASPECT_RATIO_CONSTRAINTS } from '@foundation/media/record/recorder';
import { Checkable, DurationPipe } from '@foundation/utils';
import { CdkMenu, CdkMenuItem, CdkMenuTrigger } from '@angular/cdk/menu';
import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, effect, ElementRef, EventEmitter, HostListener, input, Input, Output, ViewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { mean } from 'lodash-es';
import { tap } from 'rxjs/operators';

@Component({
	selector: 'lib-record-actions',
	templateUrl: './record-actions.component.html',
	styleUrls: ['./record-actions.component.css'],
	standalone: true,
	imports: [
		//
		CommonModule,
		DurationPipe,
		TwArrowDropDownIcon,
		CdkMenuItem,
		CdkMenuTrigger,
		CdkMenu,
		CdkMenuTrigger,
		CdkMenuItem,
		// icons
		TwMicIcon,
		TwMicOffIcon,
		TwCamIcon,
		TwCamOffIcon,
		TwScreenCaptureIcon,
		TwUploadIcon,
		TwCancelIcon,
		TwStopIcon,
		TwDeleteIcon,
		TwLockOpenIcon,
	],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RecordActionsComponent extends Checkable {
	MediaModeOptions = MediaModeOptions;

	aspectRatioOptions = Object.entries(VideoAspectRatio).map(([key, value]) => ({
		key: value,
		label: ASPECT_RATIO_CONSTRAINTS[value].label,
	}));

	@Input() previewMode = false;
	@Input() displayVideoBtn = true;
	@Input() displayAudioBtn = true;
	@Input() displayUploadBtn = true;
	@Input() displayScreenCaptureWithVideoBtn = true;
	@Input() maxDuration = 0;

	/** Current state of the recording repository */
	recordingProps: RecordingProps = DEFAULT_RECORDING_PROPS;

	mediaMode: MediaModeOptions | null = null;
	mediaModeSetter = input<'audio' | 'video' | 'screenCapture' | 'screenCaptureAndVideo' | null>(null);

	/** To keep track of who is recording, in case of multiple recorder available */
	@Input() recordingTargetName?: string;
	@ViewChild('videoPreview') videoPreview?: ElementRef<HTMLVideoElement>;
	@ViewChild('audioMeter') audioMeter?: ElementRef<HTMLCanvasElement>;

	counter = 0;
	timeLeft = 4;
	counting = false;
	counterInterval?: any;

	buttonWidth = input<string>('45px');
	buttonHeight = input<string>('45px');
	fontColor = input<string>('inherit');
	backgroundColor = input<string>('inherit');
	borderColor = input<string>('inherit');
	borderRadius = input<string>('10px');

	/**
	 * By default equals to 0 because a recording should start immediatly
	 */
	@Input() timerDuration = 3;

	@Output() fileAvailableEvent = new EventEmitter<File>();
	@Output() chunkAvailableEvent = new EventEmitter<Blob>();
	@Output() recordStateChangeEvent = new EventEmitter<RecordingProps>();

	_recorderService = new RecorderService();
	constructor() {
		super();
		// subscribe to the recording props from recording repository
		this._recorderService.recordingProps$$$
			.pipe(
				takeUntilDestroyed(),
				tap((props) => {
					if (props.recordingState !== this.recordingProps.recordingState) {
						this.recordStateChangeEvent.emit(props);
					}

					this.recordingProps = props;
					// console.log('[RecordActions](recordingProps$$$)', props);

					if (props.recordingState == 'recording') {
						this.counting = false;
					}
					this._check();
				})
			)
			.subscribe();

		effect(() => {
			const mediaModeSetter = this.mediaModeSetter();
			if (mediaModeSetter) {
				this.setMediaMode(MediaModeOptions[mediaModeSetter]);
			} else {
				this.setMediaMode(null);
			}
		});
	}

	/**
	 * Allow to switch between audio or video recording
	 * @param mediaMode
	 */
	public async setMediaMode(mediaMode: MediaModeOptions | null) {
		this.mediaMode = mediaMode;
		this._recorderService.setRecordingProps({
			mediaMode,
		});

		console.log('[RecordActions](setMediaMode)');

		if (this.isEverythingGranted()) {
			await this.launchDevices();
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
			this.launchDevices();
		}
	}

	/**
	 * Launch browser granting procedure for audio devices
	 */
	public async requestMicrophoneAccess() {
		await this._recorderService.listAudioDevices({ removeMicBrowser: true, canAskForPermission: true });
		if (this.isEverythingGranted()) {
			this.launchDevices();
		}
	}

	public isEverythingGranted() {
		if (this.recordingProps.mediaMode === MediaModeOptions.video) return this.recordingProps.cameraAccessGranted && this.recordingProps.microphoneAccessGranted;
		if (this.recordingProps.mediaMode === MediaModeOptions.screenCaptureAndVideo) return this.recordingProps.cameraAccessGranted && this.recordingProps.microphoneAccessGranted;
		// if (this.recordingProps.mediaMode === MediaModeOptions.screenCapture) this.recordingProps.microphoneAccessGranted;
		if (this.recordingProps.mediaMode === MediaModeOptions.audio) return this.recordingProps.microphoneAccessGranted;

		return false;
	}

	private _audioContex?: AudioContext;
	public get audioContex() {
		if (!this._audioContex) {
			this._audioContex = new AudioContext();
		}
		return this._audioContex;
	}
	public set audioContex(value) {
		this._audioContex = value;
	}
	private _analyserNode?: AnalyserNode;
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

	public async launchDevices() {
		console.log('[RecordActions](launchDevice)');

		await this._recorderService.launchDevices((stream: MediaStream) => {
			if (this.videoPreview) {
				// we directly use the result of the recorder as the display input
				this.videoPreview.nativeElement.srcObject = stream;
				this.videoPreview.nativeElement.muted = true;
				this.videoPreview.nativeElement.play();
				this._check();
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
				const defaultFillColor = '#ea5a5a';
				if (canvasContext) {
					// change color
					canvasContext.fillStyle = this.backgroundColor() === 'inherit' ? defaultFillColor : this.backgroundColor();
					// add opacity
					canvasContext.globalAlpha = 0.5;
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
		this._check();
	}

	public updateAudioDevice(audioDeviceValue: MediaDeviceInfo) {
		this._recorderService.setRecordingProps({
			selectedAudioDevice: audioDeviceValue,
		});
		if (this.isEverythingGranted()) {
			this.launchDevices();
		}
	}

	public async askForVideoPermissions() {
		await this._recorderService.listVideoDevices({ removeMicBrowser: true, canAskForPermission: true, includeAudio: false }, this.cancelCurrentRecording.bind(this));
		this._check();
	}

	public async updateVideoDevice(videoDeviceValue: MediaDeviceInfo) {
		this._recorderService.setRecordingProps({
			selectedVideoDevice: videoDeviceValue,
		});
		if (this.isEverythingGranted()) {
			await this.launchDevices();
		}
	}

	public cancelCurrentRecording() {
		this._recorderService.cancelRecording();
		this._cancelRecordCounter();
		this.mediaMode = null;
	}

	/**
	 * called by the record button
	 * @returns
	 */
	public toggleRecordCounter() {
		if (this.counting) {
			this._cancelRecordCounter();
			return;
		}

		console.log('[RecordActions](toggleRecordCounter)');

		this.counter = 0;
		this.counting = true;
		const recordingTargetName = this.recordingTargetName;
		if (!recordingTargetName) {
			console.warn('No recording target name provided.');
			this._cancelRecordCounter();
			return;
		}

		this.counterInterval = setInterval(() => {
			this.counter++;
			this.timeLeft = Math.ceil((this.timerDuration * 10 - this.counter) / 10);
			this._check();

			if (this.counter >= this.timerDuration * 10) {
				this._recorderService.startRecording(
					recordingTargetName,
					(chunk: Blob) => {
						this.chunkAvailableEvent.emit(chunk);
					},
					this.cancelCurrentRecording.bind(this)
				);
				this._cancelRecordCounter();
			}
		}, 100);
	}

	private _cancelRecordCounter() {
		clearInterval(this.counterInterval);
		this.counter = 0;
		this.counting = false;
		this.timeLeft = this.timerDuration;
	}

	public stopRecording() {
		this.mediaMode = null;

		this._recorderService.stopRecording((file, recordingTargetName) => {
			console.log('[RecordActions](callback) file, recordingTargetName', file, recordingTargetName);
			this.fileAvailableEvent.emit(file);
		});
	}

	public openFileSelector() {
		throw new Error('Method not implemented.');
	}

	public t(text: string) {
		return text;
	}

	public setAspectRatio(aspectRatio: VideoAspectRatio) {
		this._recorderService.setAspectRatio(aspectRatio);
		// Relaunch devices to apply new constraints
		if (this.isEverythingGranted()) {
			this.launchDevices();
		}
	}

	public getAspectRatioLabel(aspectRatio: VideoAspectRatio): string {
		return ASPECT_RATIO_CONSTRAINTS[aspectRatio]?.label || aspectRatio;
	}

	accept = input<string>('audio/*, video/*');

	@HostListener('change', ['$event.target.files'])
	handleFileInputEvent(fileList: FileList) {
		const files = Array.from(fileList);

		if (files.length === 0) {
			console.log('No files selected');
			return;
		}

		this.fileAvailableEvent.emit(files[0]);
	}
}
