import { TestBed } from '@angular/core/testing';
import { LayoutService } from '@foundation/app/layout';
import { BehaviorSubjectReplayed } from '@foundation/utils';
import { PlayerService, StreamState } from './player.service';
import { PlaylistService, PlaylistDetails } from './playlist.service';

const buildPlaylist = (itemCount = 2): PlaylistDetails => ({
	id: 'playlist-1',
	title: 'A playlist',
	items: Array.from({ length: itemCount }, (_, index) => ({
		id: `item-${index}`,
		title: `Take ${index}`,
		mediaUrl: `https://example.test/take-${index}.mp3`,
		mediaType: 'audio' as const,
	})),
});

const emptyState = (): StreamState => ({ playing: false, duration: undefined, currentTime: undefined, canplay: false, error: false, buffered: undefined, unlocked: false });

/** A TimeRanges stand-in: jsdom does not construct one. */
const timeRanges = (ranges: [number, number][]): TimeRanges => ({
	length: ranges.length,
	start: (index: number) => ranges[index][0],
	end: (index: number) => ranges[index][1],
});

describe('PlaylistService', () => {
	const buildService = () => {
		const state$$$ = new BehaviorSubjectReplayed<StreamState>(emptyState());
		const media = { paused: true, ended: false, currentTime: 0, duration: 10, buffered: timeRanges([[0, 5]]) };
		const mediaInfo = { state$$$, media, audioInfoKey: 'key-1' };
		const player = {
			getOrCreateMediaInfo: vi.fn(() => mediaInfo),
			__playMediaByAudioInfoKey: vi.fn(),
			__pauseMediaByAudioInfoKey: vi.fn(),
			__pauseAllMedia: vi.fn(),
			__seekByAudioInfoKey: vi.fn(),
			__setVolume: vi.fn(),
			__setVolumeByAudioInfoKey: vi.fn(),
			__setPlaybackRate: vi.fn(),
			__setPlaybackRateByAudioInfoKey: vi.fn(),
		};
		const displayRootPlayer = vi.fn();

		vi.spyOn(console, 'log').mockImplementation(() => undefined);
		vi.spyOn(console, 'error').mockImplementation(() => undefined);

		TestBed.configureTestingModule({
			providers: [PlaylistService, { provide: PlayerService, useValue: player }, { provide: LayoutService, useValue: { displayRootPlayer } }],
		});

		return { service: TestBed.inject(PlaylistService), player, displayRootPlayer, state$$$, mediaInfo, media };
	};

	afterEach(() => {
		TestBed.resetTestingModule();
		vi.restoreAllMocks();
	});

	describe('before a playlist is set', () => {
		it('has no items, no current item and no playlist', () => {
			const { service } = buildService();

			expect(service.currentItems()).toEqual([]);
			expect(service.currentItem()).toBeNull();
			expect(service.currentPlaylist()).toBeNull();
		});

		it('is idle, unmuted, at full volume and normal speed', () => {
			const { service } = buildService();

			expect(service.desiredPlayingState()).toBe('idle');
			expect(service.volume()).toBe(1);
			expect(service.muted()).toBe(false);
			expect(service.playbackRate()).toBe(1);
		});
	});

	describe('setting a playlist', () => {
		it('opens the root player and starts on the first item', () => {
			const { service, displayRootPlayer } = buildService();

			service.setPlaylist(buildPlaylist());

			expect(displayRootPlayer).toHaveBeenCalledWith(true);
			expect(service.currentPlaylistId()).toBe('playlist-1');
			expect(service.currentItemIndex()).toBe(0);
			expect(service.currentItem()?.id).toBe('item-0');
			expect(service.desiredPlayingState()).toBe('play');
		});

		it('starts on the item the caller names', () => {
			const { service } = buildService();

			service.setPlaylist(buildPlaylist(), true, 1);

			expect(service.currentItemIndex()).toBe(1);
		});

		// A cached media element still holds its previous position; a caller passing startTime rewinds it.
		it('rewinds the item to the time the caller names', () => {
			const { service, player } = buildService();

			service.setPlaylist(buildPlaylist(), true, 1, 4);

			expect(player.__seekByAudioInfoKey).toHaveBeenCalledWith(expect.stringContaining('item-1'), 4);
		});

		it('leaves the position alone when the caller names no time', () => {
			const { service, player } = buildService();

			service.setPlaylist(buildPlaylist());

			expect(player.__seekByAudioInfoKey).not.toHaveBeenCalled();
		});

		it('loads a playlist without playing it when asked not to autoplay', () => {
			const { service } = buildService();

			service.setPlaylist(buildPlaylist(), false);

			expect(service.currentPlaylistId()).toBeNull();
			expect(service.desiredPlayingState()).toBe('idle');
		});

		it('resuming the same playlist plays it again rather than reloading it', () => {
			const { service } = buildService();
			const playlist = buildPlaylist();
			service.setPlaylist(playlist);
			service.pause();

			service.setPlaylist(playlist);

			expect(service.desiredPlayingState()).toBe('play');
			expect(service.currentItemIndex()).toBe(0);
		});

		it('jumping to another item of the same playlist rewinds it', () => {
			const { service, player } = buildService();
			const playlist = buildPlaylist();
			service.setPlaylist(playlist);
			player.__seekByAudioInfoKey.mockClear();

			service.setPlaylist(playlist, true, 1);

			expect(service.currentItemIndex()).toBe(1);
			expect(player.__seekByAudioInfoKey).toHaveBeenCalledWith(expect.stringContaining('item-1'), 0);
		});

		it('resuming the same playlist without autoplay leaves it paused', () => {
			const { service } = buildService();
			const playlist = buildPlaylist();
			service.setPlaylist(playlist);
			service.pause();

			service.setPlaylist(playlist, false);

			expect(service.desiredPlayingState()).toBe('pause');
		});

		it('shuffles the items when asked', () => {
			const { service } = buildService();
			service.setPlaylist(buildPlaylist(5));

			service.shuffleItems.set(true);

			expect(service.currentItems()).toHaveLength(5);
		});
	});

	describe('the transport controls', () => {
		it('play, pause and stop set what the listener asked for', () => {
			const { service } = buildService();
			service.setPlaylist(buildPlaylist(), false);

			service.play();
			expect(service.desiredPlayingState()).toBe('play');

			service.pause();
			expect(service.desiredPlayingState()).toBe('pause');

			service.stop();
			expect(service.desiredPlayingState()).toBe('stop');
		});

		it('asking to play again while playing counts the ask without changing the state', () => {
			const { service } = buildService();
			service.play();
			const before = service.askedToPlayCounter();

			service.play();

			expect(service.askedToPlayCounter()).toBe(before + 1);
			expect(service.desiredPlayingState()).toBe('play');
		});

		it('toggling flips between playing and paused', () => {
			const { service } = buildService();

			service.togglePlayPause();
			expect(service.desiredPlayingState()).toBe('play');

			service.togglePlayPause();
			expect(service.desiredPlayingState()).toBe('pause');
		});

		it('stopping and closing puts the root player away too', () => {
			const { service, displayRootPlayer } = buildService();

			service.stopAndClose();

			expect(service.desiredPlayingState()).toBe('stop');
			expect(displayRootPlayer).toHaveBeenLastCalledWith(false);
		});
	});

	describe('seeking', () => {
		it('moves the playhead of the current item', () => {
			const { service, player } = buildService();
			service.setPlaylist(buildPlaylist());
			player.__seekByAudioInfoKey.mockClear();

			service.seek(7);

			expect(player.__seekByAudioInfoKey).toHaveBeenCalledWith(expect.stringContaining('item-0'), 7);
		});

		it('seeks nothing while no playlist is loaded', () => {
			const { service, player } = buildService();

			service.seek(7);

			expect(player.__seekByAudioInfoKey).not.toHaveBeenCalled();
		});

		it('skips forward and back from where it is, clamped to the item', () => {
			const { service, player } = buildService();
			service.setPlaylist(buildPlaylist());
			service.currentTime.set(5);
			service.currentItemDuration.set(10);
			player.__seekByAudioInfoKey.mockClear();

			service.skip(3);
			expect(player.__seekByAudioInfoKey).toHaveBeenLastCalledWith(expect.anything(), 8);

			service.skip(100);
			expect(player.__seekByAudioInfoKey).toHaveBeenLastCalledWith(expect.anything(), 10);

			service.skip(-100);
			expect(player.__seekByAudioInfoKey).toHaveBeenLastCalledWith(expect.anything(), 0);
		});
	});

	describe('volume and speed', () => {
		it('clamps the volume into range', () => {
			const { service } = buildService();

			service.setVolume(5);
			expect(service.volume()).toBe(1);

			service.setVolume(-5);
			expect(service.volume()).toBe(0);
		});

		// Dragging the slider up is how people unmute; asking them to also click unmute is a bug.
		it('raising the volume above zero unmutes', () => {
			const { service } = buildService();
			service.toggleMute();

			service.setVolume(0.5);

			expect(service.muted()).toBe(false);
		});

		it('setting the volume to zero leaves the mute alone', () => {
			const { service } = buildService();
			service.toggleMute();

			service.setVolume(0);

			expect(service.muted()).toBe(true);
		});

		it('toggling the mute flips it', () => {
			const { service } = buildService();

			service.toggleMute();
			expect(service.muted()).toBe(true);

			service.toggleMute();
			expect(service.muted()).toBe(false);
		});

		it('sets a playback rate, and refuses one that would stop or reverse playback', () => {
			const { service } = buildService();

			service.setPlaybackRate(1.5);
			expect(service.playbackRate()).toBe(1.5);

			service.setPlaybackRate(0);
			service.setPlaybackRate(-1);
			service.setPlaybackRate(Number.NaN);
			expect(service.playbackRate()).toBe(1.5);
		});
	});

	describe('moving through the playlist', () => {
		it('next goes on, and wraps round to the first item', () => {
			const { service } = buildService();
			service.setPlaylist(buildPlaylist(2));

			service.next();
			expect(service.currentItemIndex()).toBe(1);

			service.next();
			expect(service.currentItemIndex()).toBe(0);
		});

		it('prev goes back, and wraps round to the last item', () => {
			const { service } = buildService();
			service.setPlaylist(buildPlaylist(2));

			service.prev();
			expect(service.currentItemIndex()).toBe(1);

			service.prev();
			expect(service.currentItemIndex()).toBe(0);
		});

		it('rewinds the item it moves to, so it starts from the top', () => {
			const { service, player } = buildService();
			service.setPlaylist(buildPlaylist(2));
			player.__seekByAudioInfoKey.mockClear();

			service.next();

			expect(player.__seekByAudioInfoKey).toHaveBeenCalledWith(expect.stringContaining('item-1'), 0);
		});

		it('next plays by default, prev does not', () => {
			const { service } = buildService();
			service.setPlaylist(buildPlaylist(2), false);
			service.currentPlaylistId.set('playlist-1');
			service.pause();

			service.next();
			expect(service.desiredPlayingState()).toBe('play');

			service.pause();
			service.prev();
			expect(service.desiredPlayingState()).toBe('pause');
		});

		// The playlist plays one file at a time and stops at the end rather than looping.
		it('running past the last item stops instead of wrapping', () => {
			const { service } = buildService();
			service.setPlaylist(buildPlaylist(2));
			service.currentItemIndex.set(1);

			service.naiveNext();

			expect(service.desiredPlayingState()).toBe('stop');
			expect(service.currentItemIndex()).toBe(1);
		});

		it('naiveNext moves on and rewinds the next item', () => {
			const { service, player } = buildService();
			service.setPlaylist(buildPlaylist(2));
			player.__seekByAudioInfoKey.mockClear();

			service.naiveNext();

			expect(service.currentItemIndex()).toBe(1);
			expect(player.__seekByAudioInfoKey).toHaveBeenCalledWith(expect.stringContaining('item-1'), 0);
		});
	});

	describe('following the media it is playing', () => {
		const withPlayingMedia = () => {
			const built = buildService();
			built.service.setPlaylist(buildPlaylist(2));
			built.service.currentPlayerMediaInfo$.next(built.mediaInfo as never);
			return built;
		};

		it('mirrors the media state onto its own signals', () => {
			const { service, state$$$ } = withPlayingMedia();

			state$$$.next({ ...emptyState(), playing: true, duration: 30, currentTime: 12, canplay: true, buffered: timeRanges([[0, 20]]) });

			expect(service.currentPlayingState()).toBe('play');
			expect(service.currentItemDuration()).toBe(30);
			expect(service.currentTime()).toBe(12);
			expect(service.canPlay()).toBe(true);
			expect(service.bufferedSeconds()).toBe(20);
		});

		it('reports an error the media hit', () => {
			const { service, state$$$ } = withPlayingMedia();

			state$$$.next({ ...emptyState(), error: true });

			expect(service.hasError()).toBe(true);
		});

		it('reads the buffer covering the playhead, and the last range when none does', () => {
			const { service, state$$$ } = withPlayingMedia();

			state$$$.next({ ...emptyState(), currentTime: 25, buffered: timeRanges([[0, 10], [20, 30]]) });
			expect(service.bufferedSeconds()).toBe(30);

			state$$$.next({ ...emptyState(), currentTime: 15, buffered: timeRanges([[0, 10], [20, 30]]) });
			expect(service.bufferedSeconds()).toBe(30);
		});

		it('reports no buffer at all when the media has none', () => {
			const { service, state$$$ } = withPlayingMedia();

			state$$$.next({ ...emptyState(), buffered: timeRanges([]) });

			expect(service.bufferedSeconds()).toBe(0);
		});

		// One file at a time: reaching the end of one moves the playlist on.
		it('moves on when the current item runs out', () => {
			const { service, state$$$, player } = withPlayingMedia();

			state$$$.next({ ...emptyState(), playing: false, duration: 10, currentTime: 10 });

			expect(player.__pauseMediaByAudioInfoKey).toHaveBeenCalled();
			expect(player.__seekByAudioInfoKey).toHaveBeenCalledWith(expect.stringContaining('item-0'), 0);
			expect(service.currentItemIndex()).toBe(1);
		});

		it('does not move on while the item is still playing', () => {
			const { service, state$$$ } = withPlayingMedia();

			state$$$.next({ ...emptyState(), playing: true, duration: 10, currentTime: 10 });

			expect(service.currentItemIndex()).toBe(0);
		});
	});

	it('hashes a playlist by its contents, so the same one is recognised', () => {
		const { service } = buildService();

		expect(service.generatePlaylistHash(buildPlaylist())).toBe(service.generatePlaylistHash(buildPlaylist()));
		expect(service.generatePlaylistHash(buildPlaylist(2))).not.toBe(service.generatePlaylistHash(buildPlaylist(3)));
	});

	it('refuses to name a key for a playlist it does not hold', () => {
		const { service } = buildService();

		expect(() => service['_generateAudioInfoKey']('nope', 'item-0')).toThrow('Playlist not found');
	});
});
