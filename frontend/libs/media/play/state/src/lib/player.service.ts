import { EntityFile } from '@foundation/files/models';
import { convertToUrl, FilesRepository } from '@foundation/files/state';
import { BehaviorSubjectReplayed } from '@foundation/utils';
import { inject, Injectable } from '@angular/core';
import { finalize, Observable, take, tap } from 'rxjs';

const AUDIO_EVENTS = ['ended', 'error', 'play', 'playing', 'pause', 'timeupdate', 'canplay', 'loadedmetadata', 'loadstart', 'seeked'];

export interface StreamState {
	playing: boolean;
	duration: number | undefined;
	buffered?: TimeRanges;
	currentTime: number | undefined;
	canplay: boolean;
	error: boolean;
	unlocked: boolean;
}

/**
 * MediaInfo is a wrapper around a media element.
 */
export interface PlayerMediaInfo {
	state$$$: BehaviorSubjectReplayed<StreamState>;
	media: HTMLAudioElement | HTMLVideoElement;
	// fileId: string;
	audioInfoKey: string;
}

const debug = false;

@Injectable({
	providedIn: 'root',
})
export class PlayerService {
	_filesRepository = inject(FilesRepository);

	/**
	 * Map of all media elements.
	 * One file can have multiple media elements
	 * the key is not the file id to allow for composition
	 */
	_mediasMap = new Map<string, PlayerMediaInfo>();

	createMediaInfoFromEntityFile(audioInfoKey: string, entityFile: EntityFile, destroyer$?: Observable<any>): PlayerMediaInfo {
		const fileUrl = convertToUrl(entityFile, 'original');
		const mediaType = entityFile.kind;
		return this.getOrCreateMediaInfo(audioInfoKey, fileUrl, mediaType, destroyer$);
	}

	/**
	 * Create a media element and store it in the medias map. Won't create a new media element if it already exists.
	 * @param audioInfoKey
	 * @param fileUrl
	 * @param mediaType
	 * @param destroyer$
	 * @returns
	 */
	getOrCreateMediaInfo(
		audioInfoKey: string,
		fileUrl: string,
		mediaType: string | undefined,
		// fileId: string,
		destroyer$?: Observable<any>
	): PlayerMediaInfo {
		// check if media already exists
		const mediaInfoExists = this._mediasMap.has(audioInfoKey);
		if (mediaInfoExists) {
			const mediaInfo = this._mediasMap.get(audioInfoKey)!;
			if (debug) console.log('%cMEDIA ALREADY EXISTS', 'color: goldenrod;', 'audioInfo details on ', audioInfoKey);
			return mediaInfo;
		}

		let media: HTMLAudioElement | HTMLVideoElement;
		if (mediaType === 'audio') {
			media = new Audio();
		} else if (mediaType === 'video') {
			media = document.createElement('video');
			media.setAttribute('playsInline', 'true');
			media.setAttribute('controls', 'false');
		} else {
			throw new Error(`Unsupported file kind: ${mediaType}`);
		}
		media.preload = 'auto';

		const state$$$ = new BehaviorSubjectReplayed<StreamState>({
			playing: false,
			duration: undefined,
			currentTime: undefined,
			canplay: false,
			error: false,
			buffered: undefined,
			unlocked: false,
		});

		const mediaInfo: PlayerMediaInfo = {
			state$$$,
			media,
			// fileId,
			audioInfoKey,
		};

		this._mediasMap.set(audioInfoKey, mediaInfo);

		const handler = (event: Event) => {
			this._updateStateEvents(audioInfoKey, event);
		};

		this._addEvents(media, AUDIO_EVENTS, handler, audioInfoKey.substring(0, 8));

		const unlock = function (e: any) {
			if (debug) console.log('%c(_addEvents) UNLOCKING', 'color:orange');

			// check if the media is already unlocked
			if (media.currentTime == 0) {
				media.load();
			}
			// Remove the touch start listener.
			document.removeEventListener('touchstart', unlock, true);
			document.removeEventListener('touchend', unlock, true);
			document.removeEventListener('click', unlock, true);
			document.removeEventListener('keydown', unlock, true);
		};

		// Setup a touch start listener to attempt an unlock in.
		document.addEventListener('touchstart', unlock, true);
		document.addEventListener('touchend', unlock, true);
		document.addEventListener('click', unlock, true);
		document.addEventListener('keydown', unlock, true);

		media.src = fileUrl;

		if (destroyer$) {
			destroyer$
				.pipe(
					take(1),
					tap(() => {
						media.pause();
						this._removeEvents(media, AUDIO_EVENTS, handler, audioInfoKey.substring(0, 8));
						media.src = '';
						this._mediasMap.delete(audioInfoKey);
						if (debug) console.log(`%cCLEARING AUDIO`, 'color: goldenrod;', 'audioInfo details on ', audioInfoKey.substring(0, 8));
					}),
					finalize(() => {
						if (debug) console.log(`%cFINALIZED AUDIO`, 'color: goldenrod;', 'audioInfo details on ', audioInfoKey.substring(0, 8));
					})
				)
				.subscribe();
		}

		return mediaInfo;
	}

	deleteMediaInfo(mediaInfo: PlayerMediaInfo) {
		const audioInfo = this._mediasMap.get(mediaInfo.audioInfoKey);
		if (!audioInfo) return;

		if (debug) console.log(`%c[PlayerService](deleteMediaInfo)CLEARING AUDIO`, 'color: goldenrod;', 'audioInfo details on ', mediaInfo.audioInfoKey);
		audioInfo.media.pause();
		this._removeEvents(audioInfo.media, AUDIO_EVENTS, () => {}, mediaInfo.audioInfoKey);
		audioInfo.media.src = '';
		audioInfo.state$$$.destructor();
		this._mediasMap.delete(mediaInfo.audioInfoKey);
	}

	deleteMediaInfoByAudioInfoKey(audioInfoKey: string) {
		const audioInfo = this._mediasMap.get(audioInfoKey);
		if (!audioInfo) return;

		this.deleteMediaInfo(audioInfo);
	}

	private _updateStateEvents(audioInfoKey: string, event: Event): void {
		const audioInfo = this._mediasMap.get(audioInfoKey);
		if (!audioInfo) return;

		const state: Partial<StreamState> = {};

		switch (event.type) {
			case 'canplay':
				state.duration = audioInfo.media.duration;
				// state.buffered = audioInfo.audio.buffered;
				state.canplay = true;
				state.unlocked = true;
				break;
			case 'play':
				state.playing = true;
				break;
			case 'playing':
				state.playing = true;
				break;
			case 'pause':
				console.log('%cPAUSE', 'color: red;', 'audioInfo details on ', audioInfo.audioInfoKey);
				state.playing = false;
				state.currentTime = audioInfo.media.currentTime;
				break;
			case 'timeupdate':
				state.currentTime = audioInfo.media.currentTime;
				break;
			case 'error':
				state.error = true;
				console.error('%cERROR', 'color: red;', 'audioInfo details on ', audioInfo.audioInfoKey, event);
				break;
			case 'ended':
				console.log('%cENDED', 'color: red;', 'audioInfo details on ', audioInfo.audioInfoKey, 'currentTime', audioInfo.media.currentTime, 'duration', audioInfo.media.duration);
				state.playing = false;
				break;
			case 'seeked':
				state.currentTime = audioInfo.media.currentTime;
				break;
			case 'loadstart':
				break;
			case 'loadedmetadata':
				break;
			default:
				console.warn('%cUNKNOWN EVENT', 'color: red;', event.type, event);
				break;
		}

		audioInfo.state$$$.next({ ...audioInfo.state$$$.value, ...state });
		// console.log('%c_updateStateEvents', 'color: orange;', event.type, audioInfo.state$$$.value);
	}

	private _addEvents(obj: HTMLAudioElement | HTMLVideoElement, events: any[], handler: any, title?: string) {
		events.forEach((event) => {
			// console.log('addEventListener', event, title ? ' to: ' + title : '', obj.src.length);
			obj.addEventListener(event, handler);
		});
	}

	private _removeEvents(obj: HTMLAudioElement | HTMLVideoElement, events: any[], handler: any, title?: string) {
		events.forEach((event) => {
			// console.log('removeEventListener', event, title ? ' to: ' + title : '', obj.src.length);
			obj.removeEventListener(event, handler);
		});
	}

	__playMedia(mediaInfo: PlayerMediaInfo, canvas?: HTMLCanvasElement) {
		const media = mediaInfo.media;
		if (media.error) {
			console.warn('%c_playMedia', 'color: #f00; font-weight: bold;', media.error);
			return;
		}
		if (!media.src) {
			console.warn('%c_playMedia', 'color: #f00; font-weight: bold;', 'no src');
			return;
		}
		if (!media.paused) {
			if (debug) console.log('%c_playMedia', 'color: #f00; font-weight: bold;', 'already playing');
			return;
		}

		if (debug) console.log('%c_playMedia', 'color: #00f; font-weight: bold;', mediaInfo, canvas);

		media.play();

		if (canvas) {
			this.__drawVideo(mediaInfo, canvas);
		}
	}

	__playMediaByAudioInfoKey(audioInfoKey: string, canvas?: HTMLCanvasElement) {
		const mediaInfo = this._mediasMap.get(audioInfoKey);
		if (!mediaInfo) return;

		this.__playMedia(mediaInfo, canvas);
	}

	__pauseMedia(mediaInfo: PlayerMediaInfo) {
		const media = mediaInfo.media;
		if (media.error) {
			console.warn('%c_pauseMedia', 'color: #f00; font-weight: bold;', media.error);
			return;
		}
		if (!media.src) {
			console.warn('%c_pauseMedia', 'color: #f00; font-weight: bold;', 'no src');
			return;
		}
		if (media.paused) {
			// console.warn('%c_pauseMedia', 'color: #f00; font-weight: bold;', 'already paused');
			return;
		}

		if (debug) console.log('%c_pauseMedia', 'color: #00f; font-weight: bold;', mediaInfo);

		media.pause();
	}

	__pauseMediaByAudioInfoKey(audioInfoKey: string) {
		const mediaInfo = this._mediasMap.get(audioInfoKey);
		if (!mediaInfo) return;

		this.__pauseMedia(mediaInfo);
	}

	__pauseAllMedia() {
		this._mediasMap.forEach((mediaInfo) => {
			this.__pauseMedia(mediaInfo);
		});
	}

	__seek(mediaInfo: PlayerMediaInfo, currentTime: number) {
		console.log('%c__seek', 'color: #00f; font-weight: bold;', mediaInfo, currentTime);

		const media = mediaInfo.media;

		if (media.error) {
			console.warn('%c_setCurrentTime', 'color: #f00; font-weight: bold;', media.error);
			return;
		}
		if (!media.src) {
			console.warn('%c_setCurrentTime', 'color: #f00; font-weight: bold;', 'no src');
			return;
		}
		if (!Number.isFinite(currentTime)) {
			console.warn('%c_setCurrentTime', 'color: #f00; font-weight: bold;', 'currentTime is not finite');
			return;
		}
		media.currentTime = currentTime;
	}

	__seekByAudioInfoKey(audioInfoKey: string, currentTime: number) {
		const mediaInfo = this._mediasMap.get(audioInfoKey);
		console.log('%c__seekByAudioInfoKey', 'color: #00f; font-weight: bold;', audioInfoKey, currentTime, mediaInfo);

		if (!mediaInfo) return;

		this.__seek(mediaInfo, currentTime);
	}

	private __drawVideo(mediaInfo: PlayerMediaInfo, canvas: HTMLCanvasElement) {
		const context = canvas.getContext('2d');
		const parent = canvas.parentElement;
		if (!parent) return;
		if (!context) return;

		// check that canvas width and height are set and not 0
		if (canvas.clientWidth === 0 || canvas.clientHeight === 0) {
			console.warn('%c__drawVideo', 'color: #f00; font-weight: bold;', 'canvas width or height is 0');
			return;
		}

		if (mediaInfo.media.nodeName.toLowerCase() === 'video') {
			const video = mediaInfo.media as HTMLVideoElement;
			const videoElement = video;

			// const videoWidth = videoElement.videoWidth;

			// const aspectRatio = video.videoWidth / video.videoHeight;
			// console.log('aspectRatio', aspectRatio);

			// var newWidth = canvas.width;
			// var newHeight = newWidth / aspectRatio;
			console.log('parent', parent, parent.clientWidth, parent.clientHeight);
			console.log('canvas', canvas, canvas.clientWidth, canvas.clientHeight);

			const dWidth = canvas.clientWidth;
			const dHeight = canvas.clientHeight;
			canvas.width = dWidth;
			canvas.height = dHeight;

			videoElement.width = dWidth;
			videoElement.height = dHeight;

			// console.log('newWidth 1', newWidth, 'newHeight 1', newHeight);

			// // If calculated height is greater than canvas height, recalculate
			// if (newHeight > canvas.height) {
			// 	newHeight = canvas.height;
			// 	newWidth = newHeight * aspectRatio;
			// }
			// console.log('newWidth 2', newWidth, 'newHeight 2', newHeight);

			// Center the image
			const dx = 0;
			const dy = 0;
			console.log('x', dx, 'y', dy);

			// const maxWidthToUse = canvas.clientWidth;
			// const maxHeightToUse = canvas.clientHeight;

			// let widthToUse = maxWidthToUse;
			// let heightToUse = maxHeightToUse;
			// let widthRatio = 1;
			// let heightRatio = 1;
			// if (videoElement.videoWidth > 0 && maxWidthToUse > 0) widthRatio = maxWidthToUse / videoElement.videoWidth;
			// if (videoElement.videoHeight > 0 && maxHeightToUse > 0) heightRatio = maxHeightToUse / videoElement.videoHeight;

			// const ratio = Math.min(widthRatio, heightRatio);

			// widthToUse = videoElement.videoWidth * ratio;
			// heightToUse = videoElement.videoHeight * ratio;

			// // set video size
			// // canvas.style.height = heightToUse + 'px';
			// // canvas.style.width = widthToUse + 'px';
			// // canvas.width = widthToUse;
			// // canvas.height = heightToUse;

			// const marginWidth = (maxWidthToUse - widthToUse) / 2;
			// const marginHeight = (maxHeightToUse - heightToUse) / 2;

			// console.log('%c__drawVideo', 'color: #00f; font-weight: bold;', 'canvas', {
			// 	videoElementVideoWidth: videoElement.videoWidth,
			// 	videoElementVideoHeight: videoElement.videoHeight,
			// 	maxWidthToUse,
			// 	maxHeightToUse,
			// 	widthRatio,
			// 	heightRatio,
			// 	ratio,
			// 	widthToUse,
			// 	heightToUse,
			// 	marginWidth,
			// 	marginHeight,
			// });

			let ratio_width = videoElement.videoWidth / dWidth;
			let ratio_height = videoElement.videoHeight / dHeight;
			let ratio = Math.max(ratio_width, ratio_height);

			const sx = 0,
				sy = 0,
				sWidth = dWidth * ratio,
				sHeight = dHeight * ratio;

			context.drawImage(video, sx, sy, sWidth, sHeight, dx, dy, dWidth, dHeight);

			const updateVideoCallback = () => {
				ratio_width = videoElement.videoWidth / dWidth;
				ratio_height = videoElement.videoHeight / dHeight;
				ratio = Math.max(ratio_width, ratio_height);

				const sx = 0,
					sy = 0,
					sWidth = dWidth * ratio,
					sHeight = dHeight * ratio;

				console.log(video, sx, sy, sWidth, sHeight, dx, dy, dWidth, dHeight);
				context.drawImage(video, sx, sy, sWidth, sHeight, dx, dy, dWidth, dHeight);
				if (video.paused || video.ended) {
					return;
				}
				setTimeout(() => {
					updateVideoCallback();
				}, 1000 / 30);
			};
			updateVideoCallback();
		} else {
			context.clearRect(0, 0, canvas.width, canvas.height);
			context.fillStyle = 'rgba(255, 255, 255, 0.7)';
			context.fillRect(40, 40, 100, 100);
			context.font = '18px serif';
			context.fillStyle = 'black';
			context.fillText('audio only', 20, 20);
		}
	}
}
