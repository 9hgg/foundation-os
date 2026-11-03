import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { LayoutService } from '@foundation/app/layout';
import { hashCode } from '@foundation/utils';
import { BehaviorSubject, filter, Subject, switchMap, tap } from 'rxjs';
import { PlayerMediaInfo, PlayerService } from './player.service';

const debug = false;

/**
 * End of the buffered range covering `currentTime` (or the last range), in
 * seconds. Used to render a buffer-health indicator on the seek bar.
 */
function bufferedEndSeconds(buffered: TimeRanges | undefined, currentTime: number): number {
	if (!buffered || buffered.length === 0) return 0;
	for (let rangeIndex = 0; rangeIndex < buffered.length; rangeIndex++) {
		if (currentTime >= buffered.start(rangeIndex) && currentTime <= buffered.end(rangeIndex)) {
			return buffered.end(rangeIndex);
		}
	}
	return buffered.end(buffered.length - 1);
}

interface PlaylistTheme {
	backgroundColor?: string;
	textColor?: string;
}

interface PlaylistItem {
	id: string;
	title: string;
	mediaUrl: string;
	mediaType: 'audio' | 'video';

	theme?: PlaylistTheme;
}

export interface PlaylistDetails {
	id: string;
	title: string;
	items: PlaylistItem[];
	theme?: PlaylistTheme;
}

/**
 * The Playlist service is made to play files, ONE BY ONE.
 */
@Injectable({
	providedIn: 'root',
})
export class PlaylistService {
	private _playerService = inject(PlayerService);
	private _layoutService = inject(LayoutService);
	private _progressAnimationFrameId: number | null = null;

	autoPlay = signal(true);

	/** Id to get the original playlist from the _playlists map */
	currentPlaylistId = signal<string | null>(null);
	/** hash of the playlist */
	currentPlaylistHash = signal('');
	/** Index of the current item in the playlist */
	currentItemIndex = signal(0);
	/** Time position in the current item */
	currentTime = signal(0);
	/** Duration of the current item */
	currentItemDuration = signal(0);
	/** End of the buffered range of the current item, in seconds */
	bufferedSeconds = signal(0);
	/** Whether the current item has buffered enough to start playing */
	canPlay = signal(false);
	/** Whether the current item failed to load/play */
	hasError = signal(false);
	/** Output volume, 0..1 */
	volume = signal(1);
	/** Whether output is muted */
	muted = signal(false);
	/** Playback speed multiplier */
	playbackRate = signal(1);
	/** random seed (0 == no shuffling) */
	shuffleItems = signal(false);
	/** Items of the current playlist */
	currentItems = computed(() => {
		this.currentPlaylistHash();
		const currentPlaylistId = this.currentPlaylistId();

		if (!currentPlaylistId) {
			return [];
		}

		const playlistDetails = this._playlists.get(currentPlaylistId);
		const items = playlistDetails ? playlistDetails.items : [];
		const shuffledItems = this.shuffleItems() ? items.sort(() => Math.random() - 0.5) : items;
		console.log('[PlaylistService](currentItems.computed)', shuffledItems);
		return shuffledItems;
	});
	/** Current item in the playlist */
	currentItem = computed(() => {
		const currentIndex = this.currentItemIndex();
		const currentItems = this.currentItems();

		if (currentIndex < 0 || currentIndex >= currentItems.length) {
			return null;
		}

		return currentItems[currentIndex];
	});

	currentPlaylist = computed(() => {
		const currentPlaylistId = this.currentPlaylistId();
		if (!currentPlaylistId) {
			return null;
		}

		return this._playlists.get(currentPlaylistId);
	});

	desiredPlayingState = signal<'pause' | 'play' | 'stop' | 'idle'>('idle');
	currentPlayingState = signal<'pause' | 'play' | 'stop' | 'idle'>('idle');

	askedToPlayCounter = signal(0);

	_playlists = new Map<string, PlaylistDetails>();

	currentPlayerMediaInfo$ = new BehaviorSubject<PlayerMediaInfo | null>(null);

	constructor() {
		const playlistDetails: PlaylistDetails = { title: 'empty', id: 'empty-playlist', items: [] };
		this._playlists.set(playlistDetails.id, playlistDetails);

		// update the player state from the media state
		this.currentPlayerMediaInfo$
			.pipe(
				// tap((playerMediaInfo) => {
				// 	console.log('[PlaylistService](constructor.playerMediaInfo.pipe)', { playerMediaInfo });
				// }),
				filter((f): f is PlayerMediaInfo => !!f),
				switchMap((playerMediaInfo) => playerMediaInfo.state$$$.$),
				tap((state) => {
					if (debug) console.log('[PlaylistService](constructor.playerMediaInfo.pipe.state)', { state }, state.currentTime);

					this.currentPlayingState.set(state.playing ? 'play' : 'pause');
					this.currentItemDuration.set(state.duration ?? 0);
					this.currentTime.set(state.currentTime ?? 0);
					this.canPlay.set(state.canplay);
					this.hasError.set(state.error);
					this.bufferedSeconds.set(bufferedEndSeconds(state.buffered, state.currentTime ?? 0));

					const currentPlaylistId = this.currentPlaylistId();
					const currentItem = this.currentItem();

					// if we reach the end of this file we need to take actions
					if (state.currentTime && state.duration && state.currentTime >= state.duration && !state.playing && currentPlaylistId && currentItem) {
						const audioInfoKey = this._generateAudioInfoKey(currentPlaylistId, currentItem.id);
						this._playerService.__pauseMediaByAudioInfoKey(audioInfoKey);
						this._playerService.__seekByAudioInfoKey(audioInfoKey, 0);

						// change desired state to stop
						// this.desiredPlayingState.set('stop');
						this.naiveNext();

						// reset the currentTime to 0 for the next one to start

						// 	console.log('[PlaylistService](constructor.playerMediaInfo.pipe.state) end of file');
						// 	this.next();
						// } else {
						// 	//
					}
				})
			)
			.subscribe();

		// reacts to changes in the desired state/items or info
		effect(() => {
			// console.log(
			// 	'[PlaylistService](constructor.effect) change'
			// 	// this.desiredPlayingState(),
			// 	// this.currentItems(),
			// 	// this.currentItemIndex(),
			// 	// this.currentPlaylistHash(),
			// 	// this.currentPlaylistId()
			// );

			this._playerService.__pauseAllMedia();

			const items = this.currentItems();
			const currentItem = items[this.currentItemIndex()];
			const desiredState = this.desiredPlayingState();
			const askedToPlayCounter = this.askedToPlayCounter();
			// const currentState = this.currentPlayingState();
			const currentPlaylistHash = this.currentPlaylistHash(); // to trigger the computed
			const currentPlaylistId = this.currentPlaylistId();

			if (!currentPlaylistId) {
				return;
			}

			if (!currentItem) {
				return;
			}

			const audioInfoKey = this._generateAudioInfoKey(currentPlaylistId, currentItem.id);

			if (desiredState === 'play') {
				if (debug) console.log('[PlaylistService](constructor.effect) play desired', audioInfoKey, currentItem.mediaUrl, currentItem.mediaType);

				const playerMediaInfo = this._playerService.getOrCreateMediaInfo(audioInfoKey, currentItem.mediaUrl, currentItem.mediaType);

				// apply the current output settings to the (possibly freshly created) media,
				// without making playback depend on them (changing volume must not restart play)
				this._playerService.__setVolume(
					playerMediaInfo,
					untracked(() => this.volume()),
					untracked(() => this.muted())
				);
				this._playerService.__setPlaybackRate(
					playerMediaInfo,
					untracked(() => this.playbackRate())
				);

				this.currentPlayerMediaInfo$.next(playerMediaInfo);

				this._playerService.__playMediaByAudioInfoKey(audioInfoKey);
			} else if (desiredState === 'pause') {
				if (debug) console.log('[PlaylistService](constructor.effect) pause desired', audioInfoKey);
				// nothing to do as we paused all media at the beginning of the effect
			} else if (desiredState === 'stop') {
				if (debug) console.log('[PlaylistService](constructor.effect) stop desired', audioInfoKey);
				this._playerService.__seekByAudioInfoKey(audioInfoKey, 0);
			}
		});

		// apply live volume/mute changes to the currently playing media
		effect(() => {
			const volume = this.volume();
			const muted = this.muted();
			const audioInfoKey = this._currentAudioInfoKey();
			if (!audioInfoKey) return;
			this._playerService.__setVolumeByAudioInfoKey(audioInfoKey, volume, muted);
		});

		// apply live playback-rate changes to the currently playing media
		effect(() => {
			const playbackRate = this.playbackRate();
			const audioInfoKey = this._currentAudioInfoKey();
			if (!audioInfoKey) return;
			this._playerService.__setPlaybackRateByAudioInfoKey(audioInfoKey, playbackRate);
		});

		effect(() => {
			const isPlaying = this.currentPlayingState() === 'play';
			this.currentPlaylistHash();
			this.currentItemIndex();

			if (isPlaying) {
				this.startProgressTicker();
			} else {
				this.stopProgressTicker();
			}
		});
	}

	/** Audio-info key of the current item, or null when nothing is loaded. */
	private _currentAudioInfoKey(): string | null {
		const currentItem = this.currentItem();
		const currentPlaylistId = this.currentPlaylistId();
		if (!currentItem || !currentPlaylistId) return null;
		return this._generateAudioInfoKey(currentPlaylistId, currentItem.id);
	}

	setPlaylist(playlistDetails: PlaylistDetails, autoPlay = true, _indexToPlay?: number, startTime?: number) {
		// if the playlist is the same as the current one, we just need to play it
		if (this.currentPlaylistHash() === this.generatePlaylistHash(playlistDetails)) {
			console.log('[PlaylistService](setPlaylist) same playlist');

			const indexToPlay = _indexToPlay ?? this.currentItemIndex();
			// if the index is different, we need to change it
			if (indexToPlay !== this.currentItemIndex()) {
				console.log('[PlaylistService](setPlaylist) new index', indexToPlay);
				this.seekItemToStart(playlistDetails, indexToPlay);
				this.currentItemIndex.set(indexToPlay);
			}

			// if the desired state is play or autoplay is true, we need to play it
			if (this.desiredPlayingState() === 'play' || autoPlay) {
				this.play();
			}
			return;
		} else {
			console.log('[PlaylistService](setPlaylist) new playlist', playlistDetails);
		}

		this._playlists.set(playlistDetails.id, playlistDetails);
		console.log('[PlaylistService](setPlaylist)', playlistDetails);

		if (autoPlay) {
			const indexToPlay = _indexToPlay ?? 0;
			this.currentPlaylistId.set(playlistDetails.id);
			this.currentPlaylistHash.set(this.generatePlaylistHash(playlistDetails));
			this.currentItemIndex.set(indexToPlay);
			// Switching to a different item reuses a cached media element that still
			// holds its previous currentTime; a caller passing startTime rewinds it so
			// the clip starts there instead of resuming. undefined = leave it be.
			if (startTime !== undefined) this.seekItemToStart(playlistDetails, indexToPlay, startTime);
			this.play();
		}
	}

	private seekItemToStart(playlistDetails: PlaylistDetails, itemIndex: number, time = 0) {
		const playlistItem = playlistDetails.items[itemIndex];
		if (!playlistItem) return;

		const audioInfoKey = this._generateAudioInfoKey(playlistDetails.id, playlistItem.id);
		this._playerService.__seekByAudioInfoKey(audioInfoKey, time);
	}

	private startProgressTicker() {
		if (this._progressAnimationFrameId !== null) return;

		const tick = () => {
			const mediaInfo = this.currentPlayerMediaInfo$.value;
			if (!mediaInfo || mediaInfo.media.paused || mediaInfo.media.ended) {
				this._progressAnimationFrameId = null;
				return;
			}

			const media = mediaInfo.media;
			this.currentTime.set(media.currentTime);
			if (Number.isFinite(media.duration)) {
				this.currentItemDuration.set(media.duration);
			}
			this.bufferedSeconds.set(bufferedEndSeconds(media.buffered, media.currentTime));

			this._progressAnimationFrameId = requestAnimationFrame(tick);
		};

		this._progressAnimationFrameId = requestAnimationFrame(tick);
	}

	private stopProgressTicker() {
		if (this._progressAnimationFrameId === null) return;
		cancelAnimationFrame(this._progressAnimationFrameId);
		this._progressAnimationFrameId = null;
	}

	generatePlaylistHash(playlistDetails: PlaylistDetails) {
		return hashCode(JSON.stringify(playlistDetails));
	}

	private _generateAudioInfoKey(playlistId: string, playlistItemId: string) {
		const playlistDetails = this._playlists.get(playlistId);
		if (!playlistDetails) {
			console.error('[PlaylistService](_generateAudioInfoKey) playlist not found', playlistId);
			throw new Error('Playlist not found');
		}

		const playlistHash = this.generatePlaylistHash(playlistDetails);
		return 'rootPlaylist-' + playlistHash + '-' + playlistItemId;
	}

	play() {
		this._layoutService.displayRootPlayer(true);
		this.askedToPlayCounter.update((v) => v + 1);

		if (this.desiredPlayingState() === 'play') {
			console.log('[PlaylistService](play) already playing');

			return;
		}

		this.desiredPlayingState.set('play');
	}

	pause() {
		this.desiredPlayingState.set('pause');
	}

	stop() {
		this.desiredPlayingState.set('stop');
	}

	stopAndClose() {
		this.stop();
		this._layoutService.displayRootPlayer(false);
	}

	togglePlayPause() {
		if (this.desiredPlayingState() === 'play') {
			this.desiredPlayingState.set('pause');
		} else {
			this.desiredPlayingState.set('play');
		}
	}

	seek(time: number) {
		const currentPlaylistItem = this.currentItem();
		const currentPlaylistId = this.currentPlaylistId();

		if (!currentPlaylistId) {
			return;
		}

		if (!currentPlaylistItem) {
			return;
		}
		const audioInfoKey = this._generateAudioInfoKey(currentPlaylistId, currentPlaylistItem.id);
		if (debug) console.log('[PlaylistService](seek)', audioInfoKey, time);

		this._playerService.__seekByAudioInfoKey(audioInfoKey, time);
	}

	/** Seek relative to the current position, clamped to [0, duration]. */
	skip(deltaSeconds: number) {
		const targetTime = Math.min(this.currentItemDuration(), Math.max(0, this.currentTime() + deltaSeconds));
		this.seek(targetTime);
	}

	setVolume(volume: number) {
		const clampedVolume = Math.min(1, Math.max(0, volume));
		this.volume.set(clampedVolume);
		// dragging the volume above zero implicitly unmutes
		if (clampedVolume > 0) this.muted.set(false);
	}

	toggleMute() {
		this.muted.update((muted) => !muted);
	}

	setPlaybackRate(playbackRate: number) {
		if (!Number.isFinite(playbackRate) || playbackRate <= 0) return;
		this.playbackRate.set(playbackRate);
	}

	naiveNext() {
		const items = this.currentItems();
		const currentItemIndex = this.currentItemIndex();
		const nextIndex = currentItemIndex + 1;
		if (nextIndex >= items.length) {
			this.stop();
			return;
		}
		const currentPlaylist = this.currentPlaylist();
		if (currentPlaylist) {
			this.seekItemToStart(currentPlaylist, nextIndex);
		}
		this.currentItemIndex.set(nextIndex);
	}

	next(play: boolean = true) {
		const items = this.currentItems();
		const currentItemIndex = this.currentItemIndex();
		let nextIndex = currentItemIndex + 1;
		if (nextIndex >= items.length) {
			nextIndex = 0;
		}
		const nextItem = items[nextIndex];
		const currentPlaylistId = this.currentPlaylistId();

		if (nextItem && currentPlaylistId) {
			const nextAudioInfoKey = this._generateAudioInfoKey(currentPlaylistId, nextItem.id);
			this._playerService.__seekByAudioInfoKey(nextAudioInfoKey, 0);
		}

		// const items = this.currentItems();
		// const currentItemIndex = this.currentItemIndex();
		// let nextIndex = currentItemIndex + 1;
		// if (nextIndex >= items.length) {
		// 	nextIndex = 0;
		// }
		this.currentItemIndex.set(nextIndex);

		if (play) {
			this.play();
		}
	}

	prev(play: boolean = false) {
		const items = this.currentItems();
		const currentItemIndex = this.currentItemIndex();
		let prevIndex = currentItemIndex - 1;
		if (prevIndex < 0) {
			prevIndex = items.length - 1;
		}
		const prevItem = items[prevIndex];
		const currentPlaylistId = this.currentPlaylistId();

		if (prevItem && currentPlaylistId) {
			const prevAudioInfoKey = this._generateAudioInfoKey(currentPlaylistId, prevItem.id);
			this._playerService.__seekByAudioInfoKey(prevAudioInfoKey, 0);
		}

		this.currentItemIndex.set(prevIndex);

		if (play) {
			this.play();
		}
	}
}
