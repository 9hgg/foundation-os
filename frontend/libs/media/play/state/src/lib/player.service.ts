import { EntityFile } from '@foundation/files/models';
import { convertToUrl, FilesRepository } from '@foundation/files/state';
import { BehaviorSubjectReplayed } from '@foundation/utils';
import { inject, Injectable } from '@angular/core';
import { finalize, Observable, take, tap } from 'rxjs';

const AUDIO_EVENTS = ['ended', 'error', 'play', 'playing', 'pause', 'timeupdate', 'canplay', 'loadedmetadata', 'loadstart', 'seeked', 'progress', 'waiting'];

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

/** HTMLMediaElement.HAVE_METADATA: it knows its duration and can be seeked. */
const HAVE_METADATA = 1;

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
			media.controls = false;
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

		// A seek asked for before this existed. Replayed now that there is something to seek, and
		// after `src` so it is not refused for having nothing loaded.
		const pendingSeek = this._pendingSeeks.get(audioInfoKey);
		if (pendingSeek !== undefined) {
			this._pendingSeeks.delete(audioInfoKey);
			this.__seek(mediaInfo, pendingSeek);
		}

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
		this._removeEvents(audioInfo.media, AUDIO_EVENTS, () => undefined, mediaInfo.audioInfoKey);
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
				state.buffered = audioInfo.media.buffered;
				state.canplay = true;
				state.unlocked = true;
				break;
			case 'progress':
				state.buffered = audioInfo.media.buffered;
				break;
			case 'waiting':
				state.canplay = false;
				break;
			case 'loadedmetadata':
				state.duration = audioInfo.media.duration;
				break;
			case 'play':
				state.playing = true;
				break;
			case 'playing':
				state.playing = true;
				break;
			case 'pause':
				if (debug) console.log('%cPAUSE', 'color: red;', 'audioInfo details on ', audioInfo.audioInfoKey);
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

		// Pausing or seeking before play() settles rejects it with AbortError. That is the listener
		// changing their mind, not a failure, and unhandled it surfaced as a crash.
		media.play()?.catch((error: DOMException) => {
			if (error?.name === 'AbortError') return;
			console.warn('%c_playMedia', 'color: #f00; font-weight: bold;', error);
		});

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

	/**
	 * Where a seek should land once it can be honoured, by media key.
	 *
	 * Two moments make a seek impossible to carry out on the spot, and both leave a listener at the
	 * beginning of a file they asked to enter in the middle: the element may not exist yet (it is
	 * created when the item becomes the current one), and a fresh element does not know its duration
	 * until it has read the metadata.
	 */
	private _pendingSeeks = new Map<string, number>();

	__seek(mediaInfo: PlayerMediaInfo, currentTime: number) {
		if (debug) console.log('%c__seek', 'color: #00f; font-weight: bold;', mediaInfo, currentTime);

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

		// An element that has not read its metadata yet does not know how long it is, and drops an
		// assignment to currentTime on the floor -- which is why seeking into a file that had never
		// been played only worked the second time, once loading had caught up. Remember where we were
		// asked to go and go there as soon as it can.
		if (media.readyState >= HAVE_METADATA) {
			media.currentTime = currentTime;
			return;
		}

		const alreadyWaiting = this._pendingSeeks.has(mediaInfo.audioInfoKey);
		this._pendingSeeks.set(mediaInfo.audioInfoKey, currentTime);
		if (alreadyWaiting) return;

		media.addEventListener(
			'loadedmetadata',
			() => {
				// The latest request wins: clicking three lines while it loads should land on the third.
				const pending = this._pendingSeeks.get(mediaInfo.audioInfoKey);
				this._pendingSeeks.delete(mediaInfo.audioInfoKey);
				if (pending !== undefined) media.currentTime = pending;
			},
			{ once: true }
		);
	}

	__seekByAudioInfoKey(audioInfoKey: string, currentTime: number) {
		const mediaInfo = this._mediasMap.get(audioInfoKey);
		if (debug) console.log('%c__seekByAudioInfoKey', 'color: #00f; font-weight: bold;', audioInfoKey, currentTime, mediaInfo);

		if (!mediaInfo) {
			// Asked to start an episode partway through before anything has been created for it --
			// which is exactly what starting one from its transcript does. Dropping it here is what
			// made the first play of a file begin at zero however far in the listener had clicked.
			this._pendingSeeks.set(audioInfoKey, currentTime);
			return;
		}

		this.__seek(mediaInfo, currentTime);
	}

	__setVolume(mediaInfo: PlayerMediaInfo, volume: number, muted: boolean) {
		const media = mediaInfo.media;
		media.volume = Math.min(1, Math.max(0, volume));
		media.muted = muted;
	}

	__setVolumeByAudioInfoKey(audioInfoKey: string, volume: number, muted: boolean) {
		const mediaInfo = this._mediasMap.get(audioInfoKey);
		if (!mediaInfo) return;

		this.__setVolume(mediaInfo, volume, muted);
	}

	__setPlaybackRate(mediaInfo: PlayerMediaInfo, playbackRate: number) {
		if (!Number.isFinite(playbackRate) || playbackRate <= 0) return;
		mediaInfo.media.playbackRate = playbackRate;
	}

	__setPlaybackRateByAudioInfoKey(audioInfoKey: string, playbackRate: number) {
		const mediaInfo = this._mediasMap.get(audioInfoKey);
		if (!mediaInfo) return;

		this.__setPlaybackRate(mediaInfo, playbackRate);
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
