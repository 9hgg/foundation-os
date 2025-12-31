import { inject, Injectable } from '@angular/core';
import { NotificationService } from '@foundation/notification';
import { BehaviorSubjectReplayed } from '@foundation/utils';
import { VideoStreamMerger } from './merger.service';
import { PreventDeviceToSleep } from './mobile.utils';
import { getSupportedAudioMimeTypes, getSupportedVideoMimeTypes, MEDIARECORDER_EVENTS } from './supported-types.utils';
import { fixWebmDuration } from './webm.utils';
import { isWebview } from './webview.utils';

export enum MediaModeOptions {
	audio,
	video,
	screenCapture,
	screenCaptureAndVideo,
}

export enum VideoAspectRatio {
	ratio16_9 = '16:9',
	ratio4_3 = '4:3',
	ratio1_1 = '1:1',
	ratio9_16 = '9:16', // vertical/portrait
}

export interface AspectRatioConstraints {
	width: number;
	height: number;
	label: string;
}

export const ASPECT_RATIO_CONSTRAINTS: Record<VideoAspectRatio, AspectRatioConstraints> = {
	[VideoAspectRatio.ratio16_9]: { width: 1280, height: 720, label: '16:9 (Landscape)' },
	[VideoAspectRatio.ratio4_3]: { width: 1024, height: 768, label: '4:3 (Standard)' },
	[VideoAspectRatio.ratio1_1]: { width: 720, height: 720, label: '1:1 (Square)' },
	[VideoAspectRatio.ratio9_16]: { width: 720, height: 1280, label: '9:16 (Portrait)' },
};

export interface RecordingProps {
	recordingState:
		| 'recording' // RTC while recording
		| 'paused' // RTC while paused
		| 'stopped' // RTC after recording
		| 'recording-asked'
		| 'stopped-asked'
		| 'paused-asked'
		| 'inactive' // RTC before recording
		| 'error'
		| 'ready-to-record'
		| 'countdown';

	occupied: boolean;

	/** is the current mediaMode including a video channel ?*/
	withVideo: boolean;
	/** is the current mediaMode a mode for screen sharing? */
	withScreen: boolean;

	streamState: 'not-asked' | 'asked' | 'granted' | 'error';

	microphoneAccessGranted: boolean;
	cameraAccessGranted: boolean;

	availableAudioDevices: MediaDeviceInfo[];
	availableVideoDevices: MediaDeviceInfo[];

	selectedAudioDevice: MediaDeviceInfo | null;
	selectedVideoDevice: MediaDeviceInfo | null;

	/** Selected aspect ratio for video recording */
	selectedAspectRatio: VideoAspectRatio;

	speaking: boolean;
	mediaRecorderSupported: boolean;

	recordedDuration?: number;

	/** Can come from audio or video: extended mimetype, e.g. 'video/webm;codecs=vp8,opus' */
	selectedVideoFormat?: string;
	selectedAudioFormat?: string;
	selectedFormat?: string;
	mediaMode: MediaModeOptions | null;

	debug: boolean;

	/** just a simple indicator */
	recordingTargetName?: string;
}

export const DEFAULT_RECORDING_PROPS: RecordingProps = {
	recordingState: 'ready-to-record',
	streamState: 'not-asked',
	occupied: false,
	withVideo: false,
	withScreen: false,
	microphoneAccessGranted: false,
	cameraAccessGranted: false,

	availableAudioDevices: [],
	availableVideoDevices: [],

	selectedAudioDevice: null,
	selectedVideoDevice: null,

	selectedAspectRatio: VideoAspectRatio.ratio16_9,

	speaking: false,
	mediaRecorderSupported: false,

	recordedDuration: undefined,

	mediaMode: MediaModeOptions.audio,

	debug: true,
};

@Injectable({
	providedIn: null,
})
export class RecorderService {
	private _videoStreamMerger?: VideoStreamMerger;
	public get videoStreamMerger() {
		if (!this._videoStreamMerger) {
			const aspectRatioConstraints = ASPECT_RATIO_CONSTRAINTS[this.recordingProps.selectedAspectRatio];
			this._videoStreamMerger = new VideoStreamMerger({
				canvasWidth: aspectRatioConstraints.width,
				canvasHeight: aspectRatioConstraints.height,
			});
			this._videoStreamMerger.start();
		}
		return this._videoStreamMerger;
	}
	public set videoStreamMerger(value: VideoStreamMerger | undefined) {
		this._videoStreamMerger = value;
	}

	private _resetVideoStreamMerger() {
		if (this._videoStreamMerger) {
			this._videoStreamMerger.destroy();
			this._videoStreamMerger = undefined;
		}
	}

	mediaStream?: MediaStream;

	callback?: (blob: File, recordingTargetName?: string, duration?: number) => void;
	chunkCallback?: (blob: Blob) => void;

	mediaRecorder?: MediaRecorder;

	recordingProps$$$ = new BehaviorSubjectReplayed<RecordingProps>(DEFAULT_RECORDING_PROPS);
	public get recordingProps() {
		return this.recordingProps$$$.value;
	}

	public chunks: Blob[] = [];

	recordingTimeHistory: { key: 'data' | 'start' | 'pause' | 'resume' | 'stop'; time: number }[] = [];

	private _preventDeviceToSleep = new PreventDeviceToSleep();

	notificationsService: NotificationService = inject(NotificationService);
	constructor() {
		try {
			// check if we are in a webview
			if (isWebview(navigator.userAgent)) {
				// // open same page in system window
				// // this.notificationsService.warning('Webview detected', 'Please open this page in the system window.');
				// if (localStorage.getItem('webviewWarning') !== 'true') {
				// 	// set cooki to avoid doing it again
				// 	localStorage.setItem('webviewWarning', 'true');
				// 	window.open(window.location.href, '_system');
				// }
				console.warn('webview detected', navigator.userAgent);
			}
		} catch (e) {
			console.error('Error while trying to leave webview', e);
		}

		// this.selectedVideoFormat = getSupportedVideoMimeTypes()[0];
		const selectedAudioFormat = getSupportedAudioMimeTypes(undefined, this.recordingProps.debug)[0];
		// this.selectedFormat = this.selectedAudioFormat;

		this.setRecordingProps({
			selectedVideoFormat: getSupportedVideoMimeTypes()[0],
			selectedAudioFormat: selectedAudioFormat,
			selectedFormat: selectedAudioFormat,
		});

		if (this.recordingProps.debug) {
			console.log('%c[RecorderService](constructor) %cselectedVideoFormat: ', 'color:cyan', 'color:goldenrod', this.recordingProps.selectedVideoFormat);
			console.log('%c[RecorderService](constructor) %cselectedAudioFormat: ', 'color:cyan', 'color:goldenrod', this.recordingProps.selectedAudioFormat);
			console.log('%c[RecorderService](constructor) %cselectedFormat: ', 'color:cyan', 'color:goldenrod', this.recordingProps.selectedFormat);
		}

		// Some browsers partially implement mediaDevices. We can't just assign an object
		// with getUserMedia as it would overwrite existing properties.
		// Here, we will just add the getUserMedia property if it's missing.

		if (navigator?.mediaDevices?.getUserMedia === undefined) {
			console.warn('%c[RecorderService](constructor) getUserMedia %cnot supported', 'color:cyan', 'color:red');
			this.notificationsService.warning('This device does not support media recording. Please try another device if you plan on recording audio.', 'Device not supported');
		} else {
			if (this.recordingProps.debug) console.log('%c[RecorderService](constructor) getUserMedia %csupported', 'color:cyan', 'color:green');
			this.listAudioDevices({ removeMicBrowser: true, canAskForPermission: false });
			this.listVideoDevices({ removeMicBrowser: true, canAskForPermission: false, includeAudio: false });
		}
	}

	public setAspectRatio(aspectRatio: VideoAspectRatio) {
		this.setRecordingProps({ selectedAspectRatio: aspectRatio });
	}

	setRecordingProps(newRecordingProps: Partial<RecordingProps>) {
		const oldState = this.recordingProps$$$.value;
		const newState: RecordingProps = { ...oldState, ...newRecordingProps };
		newState.occupied = ['recording-asked', 'recording', 'paused-asked', 'paused', 'stopped-asked'].includes(newState.recordingState);
		newState.withVideo = newState.mediaMode === MediaModeOptions.video || newState.mediaMode === MediaModeOptions.screenCaptureAndVideo;
		newState.withScreen = newState.mediaMode === MediaModeOptions.screenCaptureAndVideo || newState.mediaMode === MediaModeOptions.screenCapture;

		// Reset video stream merger if aspect ratio changed
		if (newRecordingProps.selectedAspectRatio && oldState.selectedAspectRatio !== newRecordingProps.selectedAspectRatio) {
			this._resetVideoStreamMerger();
		}

		this.recordingProps$$$.next(newState);
	}

	///////////////////////////////////////////////
	//                                           //
	//                   RECORD                  //
	//                                           //
	///////////////////////////////////////////////

	async launchDevices(streamCallback?: (stream: MediaStream) => void, errorCallback?: () => void) {
		if (this.recordingProps.debug) console.log('%c[RecorderService](launchDevices) called.', 'color:cyan');

		if (this.recordingProps.occupied) {
			if (this.recordingProps.debug) console.log('%c[RecorderService](launchDevices) %crecorder occupied.', 'color:cyan', 'color:red', this.recordingProps.recordingTargetName, this.recordingProps.recordingState);
			return;
		}

		this.setRecordingProps({
			streamState: 'asked',
		});

		// ensure device(s) access
		try {
			await this.listAudioDevices({ removeMicBrowser: false, canAskForPermission: true });
			if (this.recordingProps.withVideo) {
				await this.listVideoDevices({ removeMicBrowser: false, canAskForPermission: true, includeAudio: false });
			}
		} catch (error) {
			console.error('%c[RecorderService](launchDevices) %cerror: ', 'color:cyan', 'color:red', error);
			this.setRecordingProps({
				streamState: 'error',
				recordingState: 'error',
			});
			this.stopRecording();
			if (errorCallback) errorCallback();
		}

		if (this.recordingProps.withScreen) {
			const t = await navigator.mediaDevices
				.getDisplayMedia({
					video: {
						// 4K: 3840x2160
						// 720p: 1280x720
						// 1080p: 1920x1080
						// width: { ideal: 1280 },
						height: 720,
					},
				})
				.then((newDisplayStream) => {
					this.videoStreamMerger?.addStream(newDisplayStream, {
						keepRatio: true,
						useComputedVideoDimsForCanvas: true,
						// horizontalOffset: 50,
						// verticalOffset: 50,
						// customMaxWidth: this.videoStreamMerger.canvasWidth,
						// customMaxHeight: this.videoStreamMerger.canvasHeight,
						// customMaxHeight: 150,
						// customMaxWidth: 150,
					});
					return this.videoStreamMerger;
				})
				.catch((error) => {
					console.error('%c[RecorderService](launchDevices) %cerror for screen sharing: ', 'color:cyan', 'color:red', error);
					if (errorCallback) errorCallback();
				});
			if (!t) {
				this.notificationsService.warning('Screen sharing not available.', undefined, { dialogTarget: 'screen-sharing' });
				setTimeout(() => {
					this.stopRecording();
				}, 100);
				return;
			} else {
				console.log('screen sharing available');
			}
		}

		const aspectRatioConstraints = ASPECT_RATIO_CONSTRAINTS[this.recordingProps.selectedAspectRatio];

		const constraints = {
			audio: {
				deviceId: {
					exact: this.recordingProps.microphoneAccessGranted ? this.recordingProps.selectedAudioDevice?.deviceId : undefined,
				},
			},
			...(this.recordingProps.withVideo
				? {
						video: {
							deviceId: {
								exact: this.recordingProps.cameraAccessGranted ? this.recordingProps.selectedVideoDevice?.deviceId : undefined,
							},
							width: { ideal: aspectRatioConstraints.width },
							height: { ideal: aspectRatioConstraints.height },
						},
					}
				: {}),
		};

		try {
			if (this.recordingProps.debug) console.log('%c[RecorderService](launchDevices) %cstream asked ', 'color:cyan', 'color:green', 'with this constraints:', constraints);

			navigator.mediaDevices
				.getUserMedia(constraints)
				.then((newMediaStream) => {
					this.mediaStream = newMediaStream;

					if (this.recordingProps.withScreen && this.videoStreamMerger) {
						this.videoStreamMerger.addStream(newMediaStream, {
							keepRatio: true,
							// useComputedVideoDimsForCanvas: true,
							horizontalOffset: this.videoStreamMerger.canvasWidth - 50 - 150,
							verticalOffset: this.videoStreamMerger.canvasHeight - 50 - 150,
							// customMaxWidth: this.videoStreamMerger.canvasWidth,
							// customMaxHeight: this.videoStreamMerger.canvasHeight,
							customMaxHeight: 150,
							customMaxWidth: 150,
						});
					}

					if (this.recordingProps.debug) console.log('%c[RecorderService](launchDevices) %cstream obtained. ', 'color:cyan', 'color:green', this.mediaStream);

					this.setRecordingProps({
						streamState: 'granted',
						selectedFormat: this.recordingProps.withVideo || this.recordingProps.withScreen ? this.recordingProps.selectedVideoFormat : this.recordingProps.selectedAudioFormat,
					});

					let streamToUse;
					if (this.recordingProps.withScreen && this.videoStreamMerger?.result) {
						console.log('using merged result', this.videoStreamMerger.result);

						streamToUse = this.videoStreamMerger.result;
					} else {
						console.log('using default stream');

						streamToUse = newMediaStream;
					}
					this.mediaRecorder = new MediaRecorder(streamToUse, {
						mimeType: this.recordingProps.selectedFormat,
					});
					if (this.recordingProps.debug) console.log('%c[RecorderService](launchDevices) %cmedia recorder created.', 'color:cyan', 'color:green', { selectedFormat: this.recordingProps.selectedFormat });

					if (streamCallback) {
						streamCallback(streamToUse);
					}

					const handler = (event: Event) => {
						this._processMediaRecorderEvents(event);
					};
					this._addEvents(handler);
				})
				.catch((error) => {
					console.error('%c[RecorderService](launchDevices) %cerror: ', 'color:cyan', 'color:red', error);
					this.setRecordingProps({
						streamState: 'error',
						recordingState: 'error',
					});
					this.stopRecording();
					if (errorCallback) errorCallback();
				});
		} catch (error) {
			console.error('%c[RecorderService](launchDevices) %cerror: ', 'color:cyan', 'color:red', error);
			this.setRecordingProps({
				streamState: 'error',
				recordingState: 'error',
			});
			this.stopRecording();
		}
	}

	async startRecording(recordingTargetName: string, chunkCallback?: (chunk: Blob) => void, errorCallback?: () => void) {
		if (this.recordingProps.debug) console.log('%c[RecorderService](startRecording) %cstartRecording called for this target: ', 'color:cyan', 'color:green', recordingTargetName);

		if (this.recordingProps.occupied) {
			if (this.recordingProps.debug) console.log('%c[RecorderService](startRecording) %calready occupied for this target: ', 'color:cyan', 'color:red', this.recordingProps.recordingTargetName, this.recordingProps.recordingState);
			return;
		}

		this.chunkCallback = chunkCallback;

		// reset recording history
		this.recordingTimeHistory = [];

		//Prevent device to go to sleep mode
		this._preventDeviceToSleep.enable();

		// ensure device(s) access AGAIN
		await this.listAudioDevices({ removeMicBrowser: false, canAskForPermission: true });
		if (this.recordingProps.withVideo) {
			await this.listVideoDevices({ removeMicBrowser: false, canAskForPermission: true, includeAudio: false });
		}

		if (!this.mediaStream || !this.mediaRecorder) {
			if (this.recordingProps.debug) console.log('%c[RecorderService](startRecording) %cstream or media recorder missing to record. Stopping everything ', 'color:cyan', 'color:red', this.recordingProps.recordingTargetName, this.recordingProps.recordingState, this.mediaStream, this.mediaRecorder);
			this.stopRecording();
			return;
		}

		try {
			this.setRecordingProps({
				recordingState: 'recording-asked',
				recordingTargetName,
			});
			if (this.recordingProps.debug) console.log('%c[RecorderService](startRecording) %crecording asked for this target: ', 'color:cyan', 'color:green', recordingTargetName);

			this.mediaRecorder.start(1000);
		} catch (error) {
			console.error('%c[RecorderService](startRecording) %cerror: ', 'color:cyan', 'color:red', error);
			this.setRecordingProps({
				recordingState: 'error',
			});
			this.stopRecording();
			if (errorCallback) errorCallback();
		}
	}

	private _addEvents(handler: (event: Event) => void) {
		if (!this.mediaRecorder) return;
		MEDIARECORDER_EVENTS.forEach((event) => {
			this.mediaRecorder?.addEventListener(event, handler);
		});
	}

	private _processMediaRecorderEvents(event: Event): void {
		switch (event.type) {
			case 'dataavailable': {
				this.chunks.push((event as MediaRecorderEventMap['dataavailable']).data);
				if (this.chunkCallback) this.chunkCallback((event as MediaRecorderEventMap['dataavailable']).data);

				this._updateRecordingTime({
					key: 'data',
					time: new Date().getTime(),
				});
				break;
			}
			case 'error': {
				this.setRecordingProps({
					recordingState: 'error',
				});
				this.stopRecording();
				break;
			}
			case 'pause': {
				this.setRecordingProps({
					recordingState: 'paused',
				});
				this._updateRecordingTime({
					key: 'pause',
					time: new Date().getTime(),
				});
				break;
			}
			case 'resume': {
				this.setRecordingProps({
					recordingState: 'recording',
				});

				this._updateRecordingTime({
					key: 'resume',
					time: new Date().getTime(),
				});
				break;
			}
			case 'start': {
				this.setRecordingProps({
					recordingState: 'recording',
				});

				this._updateRecordingTime({
					key: 'start',
					time: new Date().getTime(),
				});

				break;
			}
			case 'stop': {
				this._updateRecordingTime({
					key: 'stop',
					time: new Date().getTime(),
				});

				this._processAllChunksAfterStop();

				try {
					if (this.mediaStream)
						this.mediaStream
							.getTracks() // get all tracks from the MediaStream
							.forEach((track) => track.stop()); // stop each of them
				} catch (err) {
					// console.log({ err })
				}

				this.setRecordingProps({
					recordingState: 'stopped',
				});

				this.chunks = [];
				this.mediaRecorder = undefined;
				this.mediaStream = undefined;

				break;
			}
			case 'warning':
				console.warn('%c[RecorderService](_updateStateEvents) %cwarning: ', 'color:cyan', 'color:orange', event);
				break;
			default:
				console.warn('%c[RecorderService](_updateStateEvents) %cunknown event: ', 'color:cyan', 'color:orange', event);
				break;
		}
	}

	private _processAllChunksAfterStop() {
		const callback = this.callback;

		if (!callback) {
			console.warn('%c[RecorderService](_processChunks) %ccallback is undefined', 'color:cyan', 'color:orange');
			return;
		}

		const blob = new Blob(this.chunks, { type: this.recordingProps.selectedFormat });

		if (this.recordingProps.debug) console.log('Blob type:', blob.type);

		let fileExtension = blob.type.split('/')[1];
		const fileType = blob.type.split('/')[0] as 'video' | 'audio';
		if (fileExtension.indexOf(';') !== -1) {
			// extended mimetype, e.g. 'video/webm;codecs=vp8,opus'
			fileExtension = fileExtension.split(';')[0];
		}

		const filename = Date.now() + '_' + fileType;
		const fileFullName = filename + '.' + fileExtension;

		const newFile = new File([blob], fileFullName, {
			type: blob.type,
		});

		const html_media_element = document.createElement(fileType);

		html_media_element.onloadedmetadata = () => {
			// it should already be available here
			console.log('%c[RecorderService](startRecording) %c duration before trick:' + html_media_element.duration, 'color:cyan', 'color:goldenrod');
			// handle chrome's bug

			if (html_media_element.duration === Infinity) {
				// set it to bigger than the actual duration
				html_media_element.currentTime = 1e101;
				html_media_element.ontimeupdate = () => {
					// remove callback to avoid infinite loop
					html_media_element.ontimeupdate = () => {
						return;
					};
					console.log('%c[RecorderService](startRecording) %c duration after trick:' + html_media_element.duration, 'color:cyan', 'color:goldenrod');
					html_media_element.currentTime = 0;
					fixWebmDuration(newFile, 1000 * html_media_element.duration).then((data) => {
						if (this.recordingProps.debug)
							console.log('result from fixWebmDuration', {
								data,
								recordingTargetName: this.recordingProps.recordingTargetName,
							});
						callback(data, this.recordingProps.recordingTargetName, html_media_element.duration);
					});
				};
			} else {
				callback(newFile, this.recordingProps.recordingTargetName, this.recordingProps.recordedDuration);
			}
		};

		html_media_element.src = URL.createObjectURL(newFile);
	}

	private _updateRecordingTime(a: { key: 'data' | 'start' | 'pause' | 'resume' | 'stop'; time: number }) {
		this.recordingTimeHistory.push(a);

		const reducedRecordingTimeHistory = this.recordingTimeHistory.reduce(
			(prev, now) => {
				// if (this.recordingProps.debug) console.log(prev, now);

				if (now.key === 'start') {
					// reset
					return {
						cumulated: 0,
						lastTime: now.time,
						lastState: now.key,
					};
				}
				if (now.key === 'resume') {
					// update lastTime
					return {
						cumulated: prev.lastTime, // no change
						lastTime: now.time,
						lastState: now.key,
					};
				}
				if (now.key === 'pause') {
					// add diff
					return {
						cumulated: prev.cumulated + now.time - prev.lastTime,
						lastTime: now.time,
						lastState: now.key,
					};
				}
				if (now.key === 'data') {
					// add diff
					return {
						cumulated: prev.cumulated + now.time - prev.lastTime,
						lastTime: now.time,
						lastState: now.key,
					};
				}
				if (now.key === 'stop' && (prev.lastState === 'start' || prev.lastState === 'resume')) {
					// add diff if it was recording after start
					return {
						cumulated: prev.cumulated + now.time - prev.lastTime,
						lastTime: now.time,
						lastState: now.key,
					};
				}
				if (now.key === 'stop' && prev.lastState === 'pause') {
					// no diff: was already paused
					return {
						cumulated: prev.cumulated,
						lastTime: now.time,
						lastState: now.key,
					};
				}
				return prev;
			},

			{ cumulated: 0, lastTime: 0, lastState: undefined } as {
				cumulated: number;
				lastTime: number;
				lastState: string | undefined;
			}
		);
		this.setRecordingProps({
			recordedDuration: reducedRecordingTimeHistory.cumulated / 1000,
		});
	}

	pauseRecording(): void {
		if (!this.mediaRecorder) {
			console.warn('%c[RecorderService](pauseAudioRecording) %cAsked to pause recording but no media recorder available...', 'color:cyan', 'color:goldenrod');
			return;
		}
		if (this.recordingProps.debug) console.log('%c[RecorderService](pauseAudioRecording) %cAsked to pause recording...', 'color:cyan', 'color:goldenrod', this.recordingProps.recordingTargetName);
		if (this.mediaRecorder.state === 'recording') {
			//Allow device to go to sleep mode
			this._preventDeviceToSleep.disable();

			this.mediaRecorder.pause();
		} else {
			console.warn('Asked to pause recording but we are not recording.', this.mediaRecorder.state);
		}
	}

	resumeRecording(): void {
		if (!this.mediaRecorder) {
			console.warn('%c[RecorderService](resumeAudioRecording) %cAsked to resume recording but no media recorder available...', 'color:cyan', 'color:goldenrod');
			return;
		}
		if (this.recordingProps.debug)
			console.log('%c[RecorderService](resumeAudioRecording) %cAsked to resume recording...', 'color:cyan', 'color:goldenrod', {
				'recorderRTC.state': this.mediaRecorder?.state,
			});
		if (this.mediaRecorder.state === 'paused') {
			//Prevent device to go to sleep mode
			this._preventDeviceToSleep.enable();

			this.mediaRecorder.resume();
		} else {
			console.warn('Asked to resume recording but we are not paused.', this.mediaRecorder.state);
		}
	}

	cancelRecording(): void {
		// clear callback so that it is not called and chunks are not processed
		this.callback = undefined;
		this.stopRecording();
	}

	stopTracks() {
		console.log('[RecorderService](stopTracks) - stopping all tracks');

		try {
			if (this.mediaStream) {
				this.mediaStream
					.getTracks() // get all tracks from the MediaStream
					.forEach((track) => track.stop()); // stop each of them
				this.mediaStream = undefined;
			}
		} catch (err) {
			console.log({ err });
		}
	}

	stopRecording(callback?: (blob: File, recordingTargetName?: string, duration?: number) => void): void {
		this.callback = callback;

		this.setRecordingProps({
			recordingState: 'stopped-asked',
		});

		//Allow device to go to sleep mode
		this._preventDeviceToSleep.disable();

		if (this.mediaRecorder) {
			if (this.mediaRecorder.state !== 'recording' && this.mediaRecorder.state !== 'paused') {
				console.warn('Asked to stop recording but we are not recording.', this.mediaRecorder.state);
			} else {
				this.mediaRecorder.stop();
			}
		}

		this.videoStreamMerger?.stop();
		this.videoStreamMerger?.destroy();
		this.videoStreamMerger = undefined;

		this.stopTracks();

		this.setRecordingProps({
			recordingState: 'stopped',
			recordedDuration: 0,
		});
	}

	///////////////////////////////////////////////
	//                                           //
	//                   AUDIO                   //
	//                                           //
	///////////////////////////////////////////////

	setAudioDevice(selectedAudioDevice?: MediaDeviceInfo): void {
		this.setRecordingProps({
			selectedAudioDevice,
		});
		if (this.recordingProps.debug) console.log('YOU SAVED THIS AUDIO DEVICE:', selectedAudioDevice);
	}

	setAudioDeviceById(deviceId: string): void {
		const selectedAudioDevice = this.recordingProps.availableAudioDevices.find((device) => device.deviceId === deviceId);
		this.setRecordingProps({
			selectedAudioDevice,
		});
		if (this.recordingProps.debug) console.log('YOU SAVED THIS AUDIO DEVICE:', selectedAudioDevice);
	}

	logAudioSituation(message: string) {
		if (this.recordingProps.debug) console.log('%c---------------' + message + '---------------', 'color:cyan');
		if (this.recordingProps.debug) console.log('%cSelected audio device id:', 'color:cyan', this.recordingProps.selectedAudioDevice);
		if (this.recordingProps.debug) console.log('%cMicrophone accessible:', 'color:cyan', this.recordingProps.microphoneAccessGranted);
		if (this.recordingProps.debug) console.log('%cdevices:', 'color:cyan', this.recordingProps.availableAudioDevices.length, this.recordingProps.availableAudioDevices);
		if (this.recordingProps.debug) console.log('%c---------------------------------------------', 'color:cyan');
	}
	logVideoSituation(message: string) {
		if (this.recordingProps.debug) console.log('%c---------------' + message + '---------------', 'color:cyan');
		if (this.recordingProps.debug) console.log('%cSelected video device id:', 'color:cyan', this.recordingProps.selectedVideoDevice);
		if (this.recordingProps.debug) console.log('%cCamera accessible:', 'color:cyan', this.recordingProps.cameraAccessGranted);
		if (this.recordingProps.debug) console.log('%cdevices:', 'color:cyan', this.recordingProps.availableVideoDevices.length, this.recordingProps.availableVideoDevices);
		if (this.recordingProps.debug) console.log('%c---------------------------------------------', 'color:cyan');
	}

	private _processAvailableAudioDeviceList(availableAudioDevices: MediaDeviceInfo[]) {
		if (this.recordingProps.debug) console.log('%cAvailable audio devices:%c' + availableAudioDevices.length, 'color:aqua', 'color:green', availableAudioDevices);

		// CHECKING FOR THE PRESENCE OF THE PREVIOUSLY SELECTED
		const selectedAudioDevice = availableAudioDevices.find((device) => device.deviceId == this.recordingProps.selectedAudioDevice?.deviceId && device.label == this.recordingProps.selectedAudioDevice?.label);
		const newMatchingAudioDevice = availableAudioDevices.find((device) => device.deviceId == this.recordingProps.selectedAudioDevice?.deviceId);

		if (selectedAudioDevice) {
			// we can list devices AND we have still the selected one in the list
			this.setAudioDeviceById(selectedAudioDevice.deviceId);
		} else if (newMatchingAudioDevice) {
			// we found a device with the same deviceId (so not same label)
			// this should happen for default OS mics
			this.setAudioDeviceById(newMatchingAudioDevice.deviceId);
			this.notificationsService.success('You are now using this microphone: ' + newMatchingAudioDevice.label + ').', 'Microphone changed');
		} else if (this.recordingProps.selectedAudioDevice) {
			// value stored is not null, hence a choice was previsouly made but is not found anymore
			if (this.recordingProps.debug) console.log('%cAudio device selected and %c NOT available anymore', 'color:aqua', 'color:red', this.recordingProps.selectedAudioDevice);
			const defaultAudioDeviceInfo = availableAudioDevices.find((audioDeviceInfo: MediaDeviceInfo) => audioDeviceInfo.deviceId.includes('default')) || availableAudioDevices[0];
			this.setAudioDeviceById(defaultAudioDeviceInfo.deviceId);
			this.notificationsService.warning('The microphone you selected is not available. Using the default one (' + defaultAudioDeviceInfo.label + ')', 'Microphone replaced');
		} else {
			// nothing stored yet, using default
			if (this.recordingProps.debug) console.log('%cNo microphone selected. Using default one', 'color:aqua');
			const defaultAudioDeviceInfo = availableAudioDevices.find((deviceInfo: MediaDeviceInfo) => deviceInfo.deviceId == 'default') || availableAudioDevices[0];
			this.setAudioDeviceById(defaultAudioDeviceInfo.deviceId);
			// this.notificationsService.info(
			// 	'Using this microphone: ' + defaultAudioDeviceInfo.label + ')',
			// 	'Microphone selected'
			// );
		}
	}

	async listAudioDevices(
		//
		options: { removeMicBrowser: boolean; canAskForPermission: boolean } = {
			removeMicBrowser: true,
			canAskForPermission: true,
		},
		errorCallback?: () => void
	): Promise<boolean> {
		if (this.recordingProps.debug) console.log('%c[RecorderService](listAudioDevices)', 'color:cyan');
		let devices: MediaDeviceInfo[] = [];

		try {
			if (!navigator.mediaDevices.enumerateDevices) {
				console.warn('%c[RecorderService](listAudioDevices) %cNo enumerateDevices available...', 'color:cyan', 'color:goldenrod');
				return false;
			}
			devices = await navigator.mediaDevices.enumerateDevices();
		} catch (enumerateDeviceError: any) {
			this.notificationsService.warning("We can't access your media devices.", 'No media device detected', { autoCloseMs: 2000 });
			this.handleAudioError(enumerateDeviceError);
			console.error('[RecorderService](listAudioDevices)', 'Error while enumerating devices', { enumerateDeviceError });
		}
		if (this.recordingProps.debug) console.log('All available devices:', { devices });
		const availableAudioDevices = devices.filter((d) => d.deviceId && d.kind == 'audioinput' && !d.label.toLowerCase().includes('virtual'));
		this.setRecordingProps({
			availableAudioDevices,
		});

		let shouldAskForAudioPermission = false;

		if (availableAudioDevices.length > 0) {
			// we have access to an audio device list and it's not empty
			this.setRecordingProps({
				microphoneAccessGranted: true,
			});
			this._processAvailableAudioDeviceList(availableAudioDevices);
		} else {
			// we don't have access to audio device list or the audio device list is empty
			if (this.recordingProps.debug) console.log('%cAvailable audio devices:%c' + availableAudioDevices.length, 'color:aqua', 'color:red', availableAudioDevices);
			shouldAskForAudioPermission = true;
			this.setRecordingProps({
				microphoneAccessGranted: false,
			});
		}

		// check if we have mic access
		if (!this.recordingProps.microphoneAccessGranted) {
			shouldAskForAudioPermission = true;
		}

		if (!(options.canAskForPermission && shouldAskForAudioPermission)) return false;

		if (this.recordingProps.debug) console.log('%cRequesting "getUserMedia" with audio:true constraint:', 'color:aqua');
		await navigator.mediaDevices
			.getUserMedia({ audio: true })
			.then(async (stream: MediaStream) => {
				this.mediaStream = stream;

				if (this.recordingProps.debug) console.log('%cSuccessful %caccess to user media (audio).', 'color:green', 'color:aqua', stream);
				this.setRecordingProps({
					microphoneAccessGranted: true,
				});
				return navigator.mediaDevices.enumerateDevices();
			})
			.then((availableDevices: MediaDeviceInfo[]) => {
				const availableAudioDevices = availableDevices.filter((d) => d.deviceId && d.kind == 'audioinput' && !d.label.toLowerCase().includes('virtual'));
				this.setRecordingProps({
					availableAudioDevices,
				});

				if (availableAudioDevices.length > 0) {
					// we have access to device list and it's not empty
					this._processAvailableAudioDeviceList(availableAudioDevices);
				} else {
					if (this.recordingProps.debug) console.log('%c(listAudioDevices) Even with granted access to devices %cnothing was found!', 'color:aqua', 'color:red');
					this.notificationsService.warning('We found no microphone: does your device have a microphone and did you grant access to this platform?', 'No microphone found');
					throw { name: 'NotFoundError' };
				}
			})
			.catch((err) => {
				this.handleAudioError(err);
				if (errorCallback) errorCallback();
			});

		if (options.removeMicBrowser) {
			this.stopRecording();
		}
		return this.recordingProps.microphoneAccessGranted;
	}

	handleAudioError(error: { message: string; name: string }) {
		this.logAudioSituation('Beginning of handleError');

		this.setRecordingProps({
			microphoneAccessGranted: false,
		});

		if (this.recordingProps.debug) console.log('navigator.MediaDevices.getUserMedia error: ', error.message, error.name);
		if (error.name === 'PermissionDismissedError') {
			if (this.recordingProps.debug) console.log('Setting mic state as prompt due to user dismiss');
			this.notificationsService.warning('You dismissed the microphone permission modal. Please grant microphone access and reload the page.', 'Microphone access', { autoCloseMs: 5000 });
		} else if (error.name === 'PermissionDeniedError' || error.name === 'NotAllowedError') {
			if (this.recordingProps.debug) console.log('Setting mic state as denied due to user denial');
			this.notificationsService.warning('Your microphone seems disabled. Please change your navigator option and reload the page. (Click on the small locket or microphone in the address bar or look for website settings in the option menu)', 'Microphone access');
		} else if (error.name === 'NotFoundError') {
			if (this.recordingProps.debug) console.log('Setting mic state as prompt due to absence of microphone', 'Microphone access');
			this.notificationsService.error('We did not find any microphone. Please unplug and plug again then refresh the page or change your device.', 'Microphone access');
		} else {
			this.setRecordingProps({
				selectedAudioDevice: undefined,
			});
			if (this.recordingProps.debug) console.log('Error: no access to microphone:', error, error.name);
			this.notificationsService.error('We had a problem looking for a microphone. Do you have one and is it accessible?', 'Microphone access');
		}
		this.logAudioSituation('End of handleError');
	}

	///////////////////////////////////////////////
	//                                           //
	//                   VIDEO                   //
	//                                           //
	///////////////////////////////////////////////

	setVideoDevice(selectedVideoDevice?: MediaDeviceInfo): void {
		this.setRecordingProps({
			selectedVideoDevice,
		});
		if (this.recordingProps.debug) console.log('YOU SAVED THIS VIDEO DEVICE:', selectedVideoDevice);
	}

	setVideoDeviceById(videoDeviceId: string): void {
		const selectedVideoDevice = this.recordingProps.availableVideoDevices.find((device) => device.deviceId === videoDeviceId);
		this.setRecordingProps({
			selectedVideoDevice,
		});
		if (this.recordingProps.debug) console.log('YOU SAVED THIS VIDEO DEVICE:', selectedVideoDevice);
	}

	async listVideoDevices(
		//
		options: { removeMicBrowser: boolean; canAskForPermission: boolean; includeAudio: boolean } = {
			removeMicBrowser: true,
			canAskForPermission: true,
			includeAudio: true,
		},
		errorCallback?: () => void
	): Promise<boolean> {
		if (this.recordingProps.debug) console.log('%c[RecorderService](listVideoDevices)', 'color:cyan');
		let devices: MediaDeviceInfo[] = [];

		if (!navigator.mediaDevices.enumerateDevices) {
			console.warn('%c[RecorderService](listVideoDevices) %cNo enumerateDevices available...', 'color:cyan', 'color:goldenrod');
			return false;
		}
		try {
			devices = await navigator.mediaDevices.enumerateDevices();
		} catch (enumerateDeviceError) {
			this.notificationsService.warning("We can't access your media devices.", 'No media device detected');
			console.error('[RecorderService](listVideoDevices)', 'Error while enumerating video devices', {
				enumerateDeviceError,
			});
		}
		if (this.recordingProps.debug) console.log('All available video devices:', { devices });
		const availableVideoDevices = devices.filter((d) => d.deviceId && d.kind == 'videoinput' && !d.label.toLowerCase().includes('virtual'));
		this.setRecordingProps({
			availableVideoDevices,
		});

		let shouldAskForVideoPermission = false;

		if (availableVideoDevices.length > 0) {
			// we have access to device list and it's not empty
			this.setRecordingProps({
				cameraAccessGranted: true,
			});
			this._processAvailableVideoDeviceList(availableVideoDevices);
		} else {
			// we don't have access to video device list or the video device list is empty
			if (this.recordingProps.debug) console.log('%cAvailable video devices:%c' + availableVideoDevices.length, 'color:aqua', 'color:red', availableVideoDevices);
			shouldAskForVideoPermission = true;
			this.setRecordingProps({
				cameraAccessGranted: false,
			});
		}

		// check if we have camera access
		if (!this.recordingProps.cameraAccessGranted) {
			shouldAskForVideoPermission = true;
		}

		if (!(options.canAskForPermission && shouldAskForVideoPermission)) return false;

		if (this.recordingProps.debug) console.log('%cRequesting "getUserMedia" with video:true constraint:', 'color:aqua');
		await navigator.mediaDevices
			.getUserMedia({ video: true, audio: options.includeAudio ? true : undefined })
			.then(async (stream: MediaStream) => {
				this.mediaStream = stream;
				if (this.recordingProps.debug) console.log('%cSuccessful %caccess to user media.', 'color:green', 'color:aqua', stream);
				this.setRecordingProps({
					cameraAccessGranted: true,
				});
				return navigator.mediaDevices.enumerateDevices();
			})
			.then((availableDevices: MediaDeviceInfo[]) => {
				const availableVideoDevices = availableDevices.filter((d) => d.deviceId && d.kind == 'videoinput' && !d.label.toLowerCase().includes('virtual'));
				this.setRecordingProps({
					availableVideoDevices,
				});

				if (availableVideoDevices.length > 0) {
					// we have access to device list and it's not empty
					this._processAvailableVideoDeviceList(availableVideoDevices);
				} else {
					if (this.recordingProps.debug) console.log('%c(listVideoDevices) Even with granted access to video devices %cnothing was found!', 'color:aqua', 'color:red');
					this.notificationsService.warning('We found no camera: does your device have a camera and did you grant access to Rumble Studio?', 'No camera found');
					throw { name: 'NotFoundError' };
				}
			})
			.catch((err) => {
				this.handleVideoError(err);
				if (errorCallback) errorCallback();
			});

		if (options.removeMicBrowser) {
			this.stopRecording();
		}
		return this.recordingProps.cameraAccessGranted;
	}

	private _processAvailableVideoDeviceList(availableVideoDevices: MediaDeviceInfo[]) {
		if (this.recordingProps.debug) console.log('%cAvailable video devices:%c' + availableVideoDevices.length, 'color:aqua', 'color:green', availableVideoDevices);

		// CHECKING FOR THE PRESENCE OF THE PREVIOUSLY SELECTED
		const selectedVideoDevice = availableVideoDevices.find((device) => device.deviceId == this.recordingProps.selectedVideoDevice?.deviceId && device.label == this.recordingProps.selectedVideoDevice?.label);
		const newMatchingVideoDevice = availableVideoDevices.find((device) => device.deviceId == this.recordingProps.selectedVideoDevice?.deviceId);

		if (selectedVideoDevice) {
			// we can list devices AND we have still the selected one in the list
			this.setVideoDeviceById(selectedVideoDevice.deviceId);
		} else if (newMatchingVideoDevice) {
			// we found a device with the same deviceId (so not same label)
			// this should happen for default OS mics
			this.setVideoDeviceById(newMatchingVideoDevice.deviceId);
			this.notificationsService.success('You are now using this camera: ' + newMatchingVideoDevice.label + ').', 'Camera changed');
		} else if (this.recordingProps.selectedVideoDevice) {
			// value stored is not null, hence a choice was previsouly made but is not found anymore
			if (this.recordingProps.debug) console.log('%cVideo device selected but %cNOT available anymore', 'color:aqua', 'color:red', this.recordingProps.selectedVideoDevice);
			const defaultVideoDeviceInfo = availableVideoDevices.find((videoDeviceInfo: MediaDeviceInfo) => videoDeviceInfo.deviceId.includes('default')) || availableVideoDevices[0];
			this.setVideoDeviceById(defaultVideoDeviceInfo.deviceId);
			this.notificationsService.warning('The camera you selected is not available. Using the default one (' + defaultVideoDeviceInfo.label + ')', 'Camera replaced');
		} else {
			// nothing stored yet, using default
			if (this.recordingProps.debug) console.log('%cNo camera selected. Using default one', 'color:aqua');
			const defaultVideoDeviceInfo = availableVideoDevices.find((deviceInfo: MediaDeviceInfo) => deviceInfo.deviceId == 'default') || availableVideoDevices[0];
			this.setVideoDeviceById(defaultVideoDeviceInfo.deviceId);
			// this.notificationsService.info('Using this camera: ' + defaultVideoDeviceInfo.label + ')', 'Camera selected');
		}
	}

	handleVideoError(error: { message: string; name: string }) {
		this.logVideoSituation('Beginning of handleError');

		this.setRecordingProps({
			cameraAccessGranted: false,
		});

		if (this.recordingProps.debug) console.log('navigator.MediaDevices.getUserMedia error: ', error.message, error.name);
		if (error.name === 'PermissionDismissedError') {
			if (this.recordingProps.debug) console.log('Setting camera state as prompt due to user dismiss');
			this.notificationsService.warning('You dismissed the camera permission modal. Please grant camera access and reload the page.', 'Camera access');
		} else if (error.name === 'PermissionDeniedError' || error.name === 'NotAllowedError') {
			if (this.recordingProps.debug) console.log('Setting mic state as denied due to user denial');
			this.notificationsService.warning('Your camera seems disabled. Please change your navigator option and reload the page. (Click on the small locket or camera in the address bar or look for website settings in the option menu)', 'Camera access');
		} else if (error.name === 'NotFoundError') {
			if (this.recordingProps.debug) console.log('Setting mic state as prompt due to absence of camera', 'Camera access');
			this.notificationsService.error('We did not find any camera. Please unplug and plug again then refresh the page or change your device.', 'Camera access');
		} else {
			this.setRecordingProps({
				selectedVideoDevice: undefined,
			});
			if (this.recordingProps.debug) console.log('Error: no access to camera:', error, error.name);
			this.notificationsService.error('We had a problem looking for a camera. Do you have one and is it accessible?', 'Camera access');
		}
		this.logVideoSituation('End of handleError');
	}
}
