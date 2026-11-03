import { TestBed } from '@angular/core/testing';
import { PlayerService } from '@foundation/media/play/state';
import { Subject } from 'rxjs';
import { InlinePlayerComponent } from './inline-player.component';

function buildMediaInfo(media: HTMLMediaElement) {
	return {
		media,
		audioInfoKey: 'key-1',
		state$$$: { $: new Subject<any>() },
	};
}

describe('InlinePlayerComponent', () => {
	let playerService: {
		getOrCreateMediaInfo: ReturnType<typeof vi.fn>;
		deleteMediaInfo: ReturnType<typeof vi.fn>;
		__pauseAllMedia: ReturnType<typeof vi.fn>;
		__playMedia: ReturnType<typeof vi.fn>;
		__pauseMedia: ReturnType<typeof vi.fn>;
		__seek: ReturnType<typeof vi.fn>;
	};

	const build = (mediaUrl: string, mediaType: 'audio' | 'video') => {
		TestBed.configureTestingModule({
			imports: [InlinePlayerComponent],
			providers: [{ provide: PlayerService, useValue: playerService }],
		});
		const fixture = TestBed.createComponent(InlinePlayerComponent);
		fixture.componentRef.setInput('mediaUrl', mediaUrl);
		fixture.componentRef.setInput('mediaType', mediaType);
		fixture.detectChanges();
		return fixture;
	};

	beforeEach(() => {
		playerService = {
			getOrCreateMediaInfo: vi.fn(),
			deleteMediaInfo: vi.fn(),
			__pauseAllMedia: vi.fn(),
			__playMedia: vi.fn(),
			__pauseMedia: vi.fn(),
			__seek: vi.fn(),
		};
	});

	it('acquires media info for the given url/type on init', () => {
		const mediaInfo = buildMediaInfo(document.createElement('audio'));
		playerService.getOrCreateMediaInfo.mockReturnValue(mediaInfo);

		build('sp://track', 'audio');

		expect(playerService.getOrCreateMediaInfo).toHaveBeenCalledWith(expect.stringContaining('inline-player-'), 'sp://track', 'audio');
	});

	it('tears down the previous media and acquires a new one when the url changes', () => {
		const first = buildMediaInfo(document.createElement('audio'));
		const second = buildMediaInfo(document.createElement('audio'));
		playerService.getOrCreateMediaInfo.mockReturnValueOnce(first).mockReturnValueOnce(second);

		const fixture = build('sp://a', 'audio');
		fixture.componentRef.setInput('mediaUrl', 'sp://b');
		fixture.detectChanges();

		expect(playerService.deleteMediaInfo).toHaveBeenCalledWith(first);
		expect(playerService.getOrCreateMediaInfo).toHaveBeenCalledTimes(2);
	});

	it('reflects playback state updates from the media info stream', () => {
		const mediaInfo = buildMediaInfo(document.createElement('audio'));
		playerService.getOrCreateMediaInfo.mockReturnValue(mediaInfo);
		const fixture = build('sp://track', 'audio');

		mediaInfo.state$$$.$.next({ playing: true, currentTime: 12, duration: 100, canplay: true, error: false });
		fixture.detectChanges();

		expect(fixture.componentInstance.playing()).toBe(true);
		expect(fixture.componentInstance.currentTime()).toBe(12);
		expect(fixture.componentInstance.duration()).toBe(100);
		expect(fixture.componentInstance.canPlay()).toBe(true);
		expect(fixture.componentInstance.hasError()).toBe(false);
	});

	it('defaults currentTime/duration to zero when the state omits them', () => {
		const mediaInfo = buildMediaInfo(document.createElement('audio'));
		playerService.getOrCreateMediaInfo.mockReturnValue(mediaInfo);
		const fixture = build('sp://track', 'audio');

		mediaInfo.state$$$.$.next({ playing: false, canplay: false, error: false });
		fixture.detectChanges();

		expect(fixture.componentInstance.currentTime()).toBe(0);
		expect(fixture.componentInstance.duration()).toBe(0);
	});

	describe('loading', () => {
		it('is false with no media info', () => {
			const fixture = build('sp://track', 'audio');
			expect(fixture.componentInstance.loading()).toBe(false);
		});

		it('is true while there is media info, canPlay is false and there is no error', () => {
			const mediaInfo = buildMediaInfo(document.createElement('audio'));
			playerService.getOrCreateMediaInfo.mockReturnValue(mediaInfo);
			const fixture = build('sp://track', 'audio');
			expect(fixture.componentInstance.loading()).toBe(true);
		});

		it('is false once canPlay is true', () => {
			const mediaInfo = buildMediaInfo(document.createElement('audio'));
			playerService.getOrCreateMediaInfo.mockReturnValue(mediaInfo);
			const fixture = build('sp://track', 'audio');
			mediaInfo.state$$$.$.next({ playing: false, canplay: true, error: false });
			fixture.detectChanges();
			expect(fixture.componentInstance.loading()).toBe(false);
		});
	});

	describe('toggle', () => {
		it('does nothing without media info', () => {
			const fixture = build('sp://track', 'audio');
			fixture.componentInstance.toggle();
			expect(playerService.__playMedia).not.toHaveBeenCalled();
			expect(playerService.__pauseMedia).not.toHaveBeenCalled();
		});

		it('pauses every other media then plays this one when it is paused', () => {
			const media = document.createElement('audio');
			Object.defineProperty(media, 'paused', { value: true, configurable: true });
			const mediaInfo = buildMediaInfo(media);
			playerService.getOrCreateMediaInfo.mockReturnValue(mediaInfo);
			const fixture = build('sp://track', 'audio');

			fixture.componentInstance.toggle();

			expect(playerService.__pauseAllMedia).toHaveBeenCalled();
			expect(playerService.__playMedia).toHaveBeenCalledWith(mediaInfo);
		});

		it('pauses this media when it is currently playing', () => {
			const media = document.createElement('audio');
			Object.defineProperty(media, 'paused', { value: false, configurable: true });
			const mediaInfo = buildMediaInfo(media);
			playerService.getOrCreateMediaInfo.mockReturnValue(mediaInfo);
			const fixture = build('sp://track', 'audio');

			fixture.componentInstance.toggle();

			expect(playerService.__pauseMedia).toHaveBeenCalledWith(mediaInfo);
		});
	});

	describe('seek', () => {
		it('does nothing without media info', () => {
			const fixture = build('sp://track', 'audio');
			fixture.componentInstance.seek(42);
			expect(playerService.__seek).not.toHaveBeenCalled();
		});

		it('delegates to the player service with the current media info', () => {
			const mediaInfo = buildMediaInfo(document.createElement('audio'));
			playerService.getOrCreateMediaInfo.mockReturnValue(mediaInfo);
			const fixture = build('sp://track', 'audio');

			fixture.componentInstance.seek(42);

			expect(playerService.__seek).toHaveBeenCalledWith(mediaInfo, 42);
		});
	});

	describe('video host mounting', () => {
		it('moves the video element into the host and styles it for a video mediaType', () => {
			const video = document.createElement('video');
			const mediaInfo = buildMediaInfo(video);
			playerService.getOrCreateMediaInfo.mockReturnValue(mediaInfo);

			const fixture = build('sp://video', 'video');

			const hostEl = fixture.nativeElement as HTMLElement;
			const host = hostEl.querySelector('.h-full.w-full') as HTMLElement;
			expect(host?.contains(video)).toBe(true);
			expect(video.controls).toBe(false);
			expect(video.style.width).toBe('100%');
			expect(video.style.objectFit).toBe('contain');
		});
	});

	it('tears down the media info when the component is destroyed', () => {
		const mediaInfo = buildMediaInfo(document.createElement('audio'));
		playerService.getOrCreateMediaInfo.mockReturnValue(mediaInfo);
		const fixture = build('sp://track', 'audio');

		fixture.destroy();

		expect(playerService.deleteMediaInfo).toHaveBeenCalledWith(mediaInfo);
	});
});
