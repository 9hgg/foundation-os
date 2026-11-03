import { TestBed } from '@angular/core/testing';
import { convertToUrl, FilesRepository } from '@foundation/files/state';
import { Subject } from 'rxjs';
import { PlayerService, PlayerMediaInfo } from './player.service';

/** jsdom implements no playback, so the media element's own state is driven by hand. */
const setMediaState = (
	media: HTMLMediaElement,
	state: { paused?: boolean; error?: boolean; currentTime?: number; duration?: number; readyState?: number }
) => {
	if (state.paused !== undefined) Object.defineProperty(media, 'paused', { value: state.paused, configurable: true });
	if (state.error !== undefined) Object.defineProperty(media, 'error', { value: state.error ? { code: 4 } : null, configurable: true });
	if (state.currentTime !== undefined) Object.defineProperty(media, 'currentTime', { value: state.currentTime, writable: true, configurable: true });
	if (state.duration !== undefined) Object.defineProperty(media, 'duration', { value: state.duration, configurable: true });
	// jsdom leaves this at 0 -- nothing loaded -- which is precisely when a seek has to wait.
	if (state.readyState !== undefined) Object.defineProperty(media, 'readyState', { value: state.readyState, configurable: true });
};

describe('PlayerService', () => {
	let service: PlayerService;

	beforeEach(() => {
		vi.spyOn(console, 'warn').mockImplementation(() => undefined);
		vi.spyOn(console, 'error').mockImplementation(() => undefined);
		vi.spyOn(console, 'log').mockImplementation(() => undefined);
		TestBed.configureTestingModule({ providers: [PlayerService, { provide: FilesRepository, useValue: {} }] });
		service = TestBed.inject(PlayerService);
	});

	afterEach(() => {
		TestBed.resetTestingModule();
		vi.restoreAllMocks();
	});

	const audioInfo = (key = 'key-1', url = 'https://example.test/take.mp3') => service.getOrCreateMediaInfo(key, url, 'audio');
	const playable = (mediaInfo: PlayerMediaInfo) => {
		setMediaState(mediaInfo.media, { paused: true, error: false });
		vi.spyOn(mediaInfo.media, 'play').mockResolvedValue(undefined);
		vi.spyOn(mediaInfo.media, 'pause').mockImplementation(() => undefined);
		return mediaInfo;
	};

	describe('creating a media element', () => {
		it('makes an audio element for an audio file, preloaded', () => {
			const mediaInfo = audioInfo();

			expect(mediaInfo.media.tagName).toBe('AUDIO');
			expect(mediaInfo.media.preload).toBe('auto');
			expect(mediaInfo.media.src).toBe('https://example.test/take.mp3');
		});

		it('makes a controls-free inline video element for a video file', () => {
			const mediaInfo = service.getOrCreateMediaInfo('key-1', 'https://example.test/clip.mp4', 'video');

			expect(mediaInfo.media.tagName).toBe('VIDEO');
			expect(mediaInfo.media.getAttribute('playsInline')).toBe('true');
			expect((mediaInfo.media as HTMLVideoElement).controls).toBe(false);
		});

		it('refuses a kind it cannot play', () => {
			expect(() => service.getOrCreateMediaInfo('key-1', 'https://example.test/notes.pdf', 'file')).toThrow('Unsupported file kind: file');
		});

		it('starts in a state that says nothing is playing and nothing is known yet', () => {
			expect(audioInfo().state$$$.value).toEqual({
				playing: false,
				duration: undefined,
				currentTime: undefined,
				canplay: false,
				error: false,
				buffered: undefined,
				unlocked: false,
			});
		});

		// One file can be on the page several times over, so the key is not the file id.
		it('hands back the same element for a key it already has', () => {
			const first = audioInfo('key-1');
			const second = service.getOrCreateMediaInfo('key-1', 'https://example.test/other.mp3', 'audio');

			expect(second).toBe(first);
			expect(second.media.src).toBe('https://example.test/take.mp3');
		});

		it('keeps separate elements for separate keys', () => {
			expect(audioInfo('key-1').media).not.toBe(audioInfo('key-2').media);
		});

		it('builds one straight from a file, at its original quality', () => {
			const file = { id: 'file-1', kind: 'audio' };

			const mediaInfo = service.createMediaInfoFromEntityFile('key-1', file as never);

			expect(mediaInfo.media.src).toContain(convertToUrl(file as never, 'original'));
		});

		it('releases the element when the caller says it is done with it', () => {
			const destroyer$ = new Subject<void>();
			const mediaInfo = service.getOrCreateMediaInfo('key-1', 'https://example.test/take.mp3', 'audio', destroyer$);
			const pause = vi.spyOn(mediaInfo.media, 'pause').mockImplementation(() => undefined);

			destroyer$.next();

			expect(pause).toHaveBeenCalled();
			// jsdom resolves an emptied src against the document url, so the attribute is what to read.
			expect(mediaInfo.media.getAttribute('src')).toBe('');
			expect(service._mediasMap.has('key-1')).toBe(false);
		});
	});

	describe('the state it publishes', () => {
		const emit = (mediaInfo: PlayerMediaInfo, type: string) => mediaInfo.media.dispatchEvent(new Event(type));

		it('learns the duration and the buffer once the media can play', () => {
			const mediaInfo = audioInfo();
			setMediaState(mediaInfo.media, { duration: 42 });

			emit(mediaInfo, 'canplay');

			expect(mediaInfo.state$$$.value).toMatchObject({ duration: 42, canplay: true, unlocked: true });
		});

		it('learns the duration from the metadata alone', () => {
			const mediaInfo = audioInfo();
			setMediaState(mediaInfo.media, { duration: 42 });

			emit(mediaInfo, 'loadedmetadata');

			expect(mediaInfo.state$$$.value.duration).toBe(42);
		});

		it('follows play, playing and pause', () => {
			const mediaInfo = audioInfo();

			emit(mediaInfo, 'play');
			expect(mediaInfo.state$$$.value.playing).toBe(true);

			emit(mediaInfo, 'pause');
			expect(mediaInfo.state$$$.value.playing).toBe(false);

			emit(mediaInfo, 'playing');
			expect(mediaInfo.state$$$.value.playing).toBe(true);
		});

		it('follows the playhead on a time update and after a seek', () => {
			const mediaInfo = audioInfo();
			setMediaState(mediaInfo.media, { currentTime: 12.5 });

			emit(mediaInfo, 'timeupdate');
			expect(mediaInfo.state$$$.value.currentTime).toBe(12.5);

			setMediaState(mediaInfo.media, { currentTime: 30 });
			emit(mediaInfo, 'seeked');
			expect(mediaInfo.state$$$.value.currentTime).toBe(30);
		});

		it('stops saying it can play while it is waiting for more', () => {
			const mediaInfo = audioInfo();
			emit(mediaInfo, 'canplay');

			emit(mediaInfo, 'waiting');

			expect(mediaInfo.state$$$.value.canplay).toBe(false);
		});

		it('records an error, and stops playing at the end', () => {
			const mediaInfo = audioInfo();

			emit(mediaInfo, 'error');
			expect(mediaInfo.state$$$.value.error).toBe(true);

			emit(mediaInfo, 'play');
			emit(mediaInfo, 'ended');
			expect(mediaInfo.state$$$.value.playing).toBe(false);
		});

		it('says nothing new on loadstart, and warns about an event it does not know', () => {
			const mediaInfo = audioInfo();
			const before = mediaInfo.state$$$.value;

			emit(mediaInfo, 'loadstart');
			expect(mediaInfo.state$$$.value).toEqual(before);

			service['_updateStateEvents']('key-1', new Event('made-up'));
			expect(console.warn).toHaveBeenCalled();
		});

		it('ignores an event for a media it no longer has', () => {
			expect(() => service['_updateStateEvents']('gone', new Event('play'))).not.toThrow();
		});
	});

	describe('playing', () => {
		it('plays a paused media, and draws nothing without a canvas', () => {
			const mediaInfo = playable(audioInfo());

			service.__playMedia(mediaInfo);

			expect(mediaInfo.media.play).toHaveBeenCalled();
		});

		it('plays by key, and does nothing for a key it does not have', () => {
			const mediaInfo = playable(audioInfo('key-1'));

			service.__playMediaByAudioInfoKey('key-1');
			expect(mediaInfo.media.play).toHaveBeenCalled();

			expect(() => service.__playMediaByAudioInfoKey('gone')).not.toThrow();
		});

		it('does not play a media that is already playing', () => {
			const mediaInfo = playable(audioInfo());
			setMediaState(mediaInfo.media, { paused: false });

			service.__playMedia(mediaInfo);

			expect(mediaInfo.media.play).not.toHaveBeenCalled();
		});

		it('does not play a media in error, nor one with no source', () => {
			const inError = playable(audioInfo('key-1'));
			setMediaState(inError.media, { error: true });
			service.__playMedia(inError);
			expect(inError.media.play).not.toHaveBeenCalled();

			const sourceless = playable(audioInfo('key-2'));
			sourceless.media.removeAttribute('src');
			Object.defineProperty(sourceless.media, 'src', { value: '', configurable: true });
			service.__playMedia(sourceless);
			expect(sourceless.media.play).not.toHaveBeenCalled();
		});

		// Pausing or seeking before play() settles rejects it; that is the listener changing their
		// mind, not a failure.
		it('swallows the abort that comes from changing your mind mid-play', async () => {
			const mediaInfo = playable(audioInfo());
			vi.spyOn(mediaInfo.media, 'play').mockRejectedValue(Object.assign(new Error('aborted'), { name: 'AbortError' }));

			service.__playMedia(mediaInfo);
			await Promise.resolve();

			expect(console.warn).not.toHaveBeenCalled();
		});

		it('reports any other play failure', async () => {
			const mediaInfo = playable(audioInfo());
			vi.spyOn(mediaInfo.media, 'play').mockRejectedValue(Object.assign(new Error('nope'), { name: 'NotAllowedError' }));

			service.__playMedia(mediaInfo);
			await Promise.resolve();
			await Promise.resolve();

			expect(console.warn).toHaveBeenCalled();
		});
	});

	describe('pausing', () => {
		it('pauses a playing media', () => {
			const mediaInfo = playable(audioInfo());
			setMediaState(mediaInfo.media, { paused: false });

			service.__pauseMedia(mediaInfo);

			expect(mediaInfo.media.pause).toHaveBeenCalled();
		});

		it('leaves an already-paused media alone', () => {
			const mediaInfo = playable(audioInfo());

			service.__pauseMedia(mediaInfo);

			expect(mediaInfo.media.pause).not.toHaveBeenCalled();
		});

		it('pauses by key, and does nothing for a key it does not have', () => {
			const mediaInfo = playable(audioInfo('key-1'));
			setMediaState(mediaInfo.media, { paused: false });

			service.__pauseMediaByAudioInfoKey('key-1');
			expect(mediaInfo.media.pause).toHaveBeenCalled();

			expect(() => service.__pauseMediaByAudioInfoKey('gone')).not.toThrow();
		});

		it('pauses everything at once -- one player at a time is the rule', () => {
			const first = playable(audioInfo('key-1'));
			const second = playable(audioInfo('key-2'));
			setMediaState(first.media, { paused: false });
			setMediaState(second.media, { paused: false });

			service.__pauseAllMedia();

			expect(first.media.pause).toHaveBeenCalled();
			expect(second.media.pause).toHaveBeenCalled();
		});

		it('does not pause a media in error, nor one with no source', () => {
			const inError = playable(audioInfo('key-1'));
			setMediaState(inError.media, { error: true, paused: false });
			service.__pauseMedia(inError);
			expect(inError.media.pause).not.toHaveBeenCalled();

			const sourceless = playable(audioInfo('key-2'));
			setMediaState(sourceless.media, { paused: false });
			Object.defineProperty(sourceless.media, 'src', { value: '', configurable: true });
			service.__pauseMedia(sourceless);
			expect(sourceless.media.pause).not.toHaveBeenCalled();
		});
	});

	describe('seeking', () => {
		it('moves the playhead once the file knows how long it is', () => {
			const mediaInfo = audioInfo();
			setMediaState(mediaInfo.media, { error: false, currentTime: 0, readyState: 1 });

			service.__seek(mediaInfo, 12.5);

			expect(mediaInfo.media.currentTime).toBe(12.5);
		});

		it('waits for a file that has not loaded rather than dropping the seek', () => {
			// An element with no metadata does not know its duration and ignores an assignment to
			// currentTime -- which is why jumping into an episode nobody had played yet only worked
			// the second time it was asked for.
			const mediaInfo = audioInfo();
			setMediaState(mediaInfo.media, { error: false, currentTime: 0, readyState: 0 });

			service.__seek(mediaInfo, 30);
			expect(mediaInfo.media.currentTime).toBe(0);

			mediaInfo.media.dispatchEvent(new Event('loadedmetadata'));
			expect(mediaInfo.media.currentTime).toBe(30);
		});

		it('lands on the last place asked for while it was loading', () => {
			const mediaInfo = audioInfo();
			setMediaState(mediaInfo.media, { error: false, currentTime: 0, readyState: 0 });

			service.__seek(mediaInfo, 10);
			service.__seek(mediaInfo, 20);
			service.__seek(mediaInfo, 42);
			mediaInfo.media.dispatchEvent(new Event('loadedmetadata'));

			expect(mediaInfo.media.currentTime).toBe(42);
		});

		it('remembers a seek asked for before the media existed', () => {
			// Starting an episode partway through -- what clicking a line of its transcript does --
			// asks for the seek before anything has been created to seek. Dropping it there is what
			// made the first play of a file begin at zero however far in the listener had clicked.
			service.__seekByAudioInfoKey('not-yet', 42);

			const mediaInfo = service.getOrCreateMediaInfo('not-yet', 'https://example.test/take.mp3', 'audio');
			mediaInfo.media.dispatchEvent(new Event('loadedmetadata'));

			expect(mediaInfo.media.currentTime).toBe(42);
		});

		it('seeks by key, and does nothing for a key it does not have', () => {
			const mediaInfo = audioInfo('key-1');
			setMediaState(mediaInfo.media, { error: false, currentTime: 0, readyState: 1 });

			service.__seekByAudioInfoKey('key-1', 5);
			expect(mediaInfo.media.currentTime).toBe(5);

			expect(() => service.__seekByAudioInfoKey('gone', 5)).not.toThrow();
		});

		it('refuses a time that is not a number', () => {
			const mediaInfo = audioInfo();
			setMediaState(mediaInfo.media, { error: false, currentTime: 3 });

			service.__seek(mediaInfo, Number.NaN);
			service.__seek(mediaInfo, Number.POSITIVE_INFINITY);

			expect(mediaInfo.media.currentTime).toBe(3);
		});

		it('does not seek a media in error, nor one with no source', () => {
			const inError = audioInfo('key-1');
			setMediaState(inError.media, { error: true, currentTime: 3 });
			service.__seek(inError, 10);
			expect(inError.media.currentTime).toBe(3);

			const sourceless = audioInfo('key-2');
			setMediaState(sourceless.media, { error: false, currentTime: 3 });
			Object.defineProperty(sourceless.media, 'src', { value: '', configurable: true });
			service.__seek(sourceless, 10);
			expect(sourceless.media.currentTime).toBe(3);
		});
	});

	describe('volume and speed', () => {
		it('sets the volume and the mute together', () => {
			const mediaInfo = audioInfo();

			service.__setVolume(mediaInfo, 0.5, true);

			expect(mediaInfo.media.volume).toBe(0.5);
			expect(mediaInfo.media.muted).toBe(true);
		});

		it('clamps the volume into the range the element accepts', () => {
			const mediaInfo = audioInfo();

			service.__setVolume(mediaInfo, 5, false);
			expect(mediaInfo.media.volume).toBe(1);

			service.__setVolume(mediaInfo, -5, false);
			expect(mediaInfo.media.volume).toBe(0);
		});

		it('sets the volume by key, and does nothing for a key it does not have', () => {
			const mediaInfo = audioInfo('key-1');

			service.__setVolumeByAudioInfoKey('key-1', 0.25, false);
			expect(mediaInfo.media.volume).toBe(0.25);

			expect(() => service.__setVolumeByAudioInfoKey('gone', 0.5, false)).not.toThrow();
		});

		it('sets the playback rate', () => {
			const mediaInfo = audioInfo();

			service.__setPlaybackRate(mediaInfo, 1.5);

			expect(mediaInfo.media.playbackRate).toBe(1.5);
		});

		it('refuses a rate that would stop or reverse playback', () => {
			const mediaInfo = audioInfo();
			mediaInfo.media.playbackRate = 1;

			service.__setPlaybackRate(mediaInfo, 0);
			service.__setPlaybackRate(mediaInfo, -1);
			service.__setPlaybackRate(mediaInfo, Number.NaN);

			expect(mediaInfo.media.playbackRate).toBe(1);
		});

		it('sets the rate by key, and does nothing for a key it does not have', () => {
			const mediaInfo = audioInfo('key-1');

			service.__setPlaybackRateByAudioInfoKey('key-1', 2);
			expect(mediaInfo.media.playbackRate).toBe(2);

			expect(() => service.__setPlaybackRateByAudioInfoKey('gone', 2)).not.toThrow();
		});
	});

	describe('deleting a media element', () => {
		it('pauses it, drops its source and forgets it', () => {
			const mediaInfo = playable(audioInfo('key-1'));

			service.deleteMediaInfo(mediaInfo);

			expect(mediaInfo.media.pause).toHaveBeenCalled();
			expect(mediaInfo.media.getAttribute('src')).toBe('');
			expect(service._mediasMap.has('key-1')).toBe(false);
		});

		it('deletes by key, and does nothing for a key it does not have', () => {
			playable(audioInfo('key-1'));

			service.deleteMediaInfoByAudioInfoKey('key-1');
			expect(service._mediasMap.has('key-1')).toBe(false);

			expect(() => service.deleteMediaInfoByAudioInfoKey('gone')).not.toThrow();
		});

		it('deleting one it no longer has is a no-op', () => {
			const mediaInfo = playable(audioInfo('key-1'));
			service.deleteMediaInfo(mediaInfo);

			expect(() => service.deleteMediaInfo(mediaInfo)).not.toThrow();
		});
	});
});
