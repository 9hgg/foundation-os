import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { PlaylistService } from '@foundation/media/play/state';
import { BehaviorSubject } from 'rxjs';
import { PlaylistBarComponent } from './playlist-bar.component';

function buildPlaylistService() {
	return {
		currentPlayerMediaInfo$: new BehaviorSubject<any>(null),
		currentItem: signal<any>(null),
		currentPlaylist: signal<any>(null),
		currentPlayingState: signal<'pause' | 'play' | 'stop' | 'idle'>('idle'),
		togglePlayPause: vi.fn(),
		playbackRate: signal(1),
		volume: signal(1),
		muted: signal(false),
		hasError: signal(false),
		canPlay: signal(false),
		currentTime: signal(0),
		currentItemDuration: signal(0),
		bufferedSeconds: signal(0),
		seek: vi.fn(),
		skip: vi.fn(),
		setVolume: vi.fn(),
		toggleMute: vi.fn(),
		setPlaybackRate: vi.fn(),
		stopAndClose: vi.fn(),
		next: vi.fn(),
		prev: vi.fn(),
	};
}

describe('PlaylistBarComponent', () => {
	let playlistService: ReturnType<typeof buildPlaylistService>;

	const build = () => {
		TestBed.configureTestingModule({
			imports: [PlaylistBarComponent],
			providers: [{ provide: PlaylistService, useValue: playlistService }],
		});
		return TestBed.createComponent(PlaylistBarComponent);
	};

	beforeEach(() => {
		playlistService = buildPlaylistService();
	});

	describe('isSilent', () => {
		it('is false with sound on', () => {
			const fixture = build();
			fixture.detectChanges();
			expect(fixture.componentInstance.isSilent()).toBe(false);
		});

		it('is true when muted', () => {
			playlistService.muted.set(true);
			const fixture = build();
			fixture.detectChanges();
			expect(fixture.componentInstance.isSilent()).toBe(true);
		});

		it('is true when the volume is exactly zero', () => {
			playlistService.volume.set(0);
			const fixture = build();
			fixture.detectChanges();
			expect(fixture.componentInstance.isSilent()).toBe(true);
		});
	});

	describe('waveformMediaUrl', () => {
		it('is null when useWaveform is off, even with a current item', () => {
			playlistService.currentItem.set({ mediaUrl: 'sp://track' });
			const fixture = build();
			fixture.detectChanges();
			expect(fixture.componentInstance.waveformMediaUrl()).toBeNull();
		});

		it('is null when there is no current item, even with useWaveform on', () => {
			const fixture = build();
			fixture.componentRef.setInput('useWaveform', true);
			fixture.detectChanges();
			expect(fixture.componentInstance.waveformMediaUrl()).toBeNull();
		});

		it('is the current item media url once both are set', () => {
			playlistService.currentItem.set({ mediaUrl: 'sp://track' });
			const fixture = build();
			fixture.componentRef.setInput('useWaveform', true);
			fixture.detectChanges();
			expect(fixture.componentInstance.waveformMediaUrl()).toBe('sp://track');
		});
	});

	describe('isLoading', () => {
		it('is false with no current item', () => {
			const fixture = build();
			fixture.detectChanges();
			expect(fixture.componentInstance.isLoading()).toBe(false);
		});

		it('is true while there is a current item, canPlay is false and there is no error', () => {
			playlistService.currentItem.set({ mediaUrl: 'sp://track' });
			const fixture = build();
			fixture.detectChanges();
			expect(fixture.componentInstance.isLoading()).toBe(true);
		});

		it('is false once the media can play', () => {
			playlistService.currentItem.set({ mediaUrl: 'sp://track' });
			playlistService.canPlay.set(true);
			const fixture = build();
			fixture.detectChanges();
			expect(fixture.componentInstance.isLoading()).toBe(false);
		});

		it('is false when the media errored, even without canPlay', () => {
			playlistService.currentItem.set({ mediaUrl: 'sp://track' });
			playlistService.hasError.set(true);
			const fixture = build();
			fixture.detectChanges();
			expect(fixture.componentInstance.isLoading()).toBe(false);
		});
	});

	describe('transport delegation', () => {
		it('onSeek delegates to the playlist service', () => {
			const fixture = build();
			fixture.detectChanges();
			fixture.componentInstance.onSeek(12);
			expect(playlistService.seek).toHaveBeenCalledWith(12);
		});

		it('skipBackward skips by minus the configured seconds', () => {
			const fixture = build();
			fixture.detectChanges();
			fixture.componentInstance.skipBackward();
			expect(playlistService.skip).toHaveBeenCalledWith(-10);
		});

		it('skipForward skips forward by the configured seconds', () => {
			const fixture = build();
			fixture.detectChanges();
			fixture.componentInstance.skipForward();
			expect(playlistService.skip).toHaveBeenCalledWith(10);
		});

		it('onVolumeInput reads the slider value into setVolume', () => {
			const fixture = build();
			fixture.detectChanges();
			const input = document.createElement('input');
			input.value = '0.4';
			fixture.componentInstance.onVolumeInput({ target: input } as unknown as Event);
			expect(playlistService.setVolume).toHaveBeenCalledWith(0.4);
		});

		it('onVolumeInput ignores an event whose target is not an input', () => {
			const fixture = build();
			fixture.detectChanges();
			fixture.componentInstance.onVolumeInput({ target: null } as unknown as Event);
			expect(playlistService.setVolume).not.toHaveBeenCalled();
		});

		it('toggleMute delegates', () => {
			const fixture = build();
			fixture.detectChanges();
			fixture.componentInstance.toggleMute();
			expect(playlistService.toggleMute).toHaveBeenCalled();
		});

		it('stopAndClose delegates', () => {
			const fixture = build();
			fixture.detectChanges();
			fixture.componentInstance.stopAndClose();
			expect(playlistService.stopAndClose).toHaveBeenCalled();
		});

		it('next delegates', () => {
			const fixture = build();
			fixture.detectChanges();
			fixture.componentInstance.next();
			expect(playlistService.next).toHaveBeenCalled();
		});

		it('prev delegates', () => {
			const fixture = build();
			fixture.detectChanges();
			fixture.componentInstance.prev();
			expect(playlistService.prev).toHaveBeenCalled();
		});
	});

	describe('cyclePlaybackRate', () => {
		it('cycles through the fixed rate list, wrapping back to the start', () => {
			const fixture = build();
			fixture.detectChanges();

			fixture.componentInstance.cyclePlaybackRate();
			expect(playlistService.setPlaybackRate).toHaveBeenLastCalledWith(1.25);

			playlistService.playbackRate.set(0.5);
			fixture.componentInstance.cyclePlaybackRate();
			expect(playlistService.setPlaybackRate).toHaveBeenLastCalledWith(1);
		});

		it('falls back to the first rate when the current one is not in the list', () => {
			playlistService.playbackRate.set(3);
			const fixture = build();
			fixture.detectChanges();
			fixture.componentInstance.cyclePlaybackRate();
			expect(playlistService.setPlaybackRate).toHaveBeenLastCalledWith(1);
		});
	});

	describe('floating video player', () => {
		it('moves the video element from the media info into the floating container once both exist', () => {
			playlistService.currentItem.set({ mediaType: 'video', mediaUrl: 'sp://video' });
			const fixture = build();
			fixture.detectChanges();

			const video = document.createElement('video');
			playlistService.currentPlayerMediaInfo$.next({ media: video, audioInfoKey: 'k', state$$$: null as never });
			fixture.detectChanges();

			const container = fixture.componentInstance.floatingVideoContainer()?.nativeElement;
			expect(container?.contains(video)).toBe(true);
			expect(video.controls).toBe(false);
			expect(video.style.width).toBe('100%');
			expect(video.style.objectFit).toBe('contain');
		});

		it('does nothing when the media is audio, not a video element', () => {
			playlistService.currentItem.set({ mediaType: 'video', mediaUrl: 'sp://video' });
			const fixture = build();
			fixture.detectChanges();

			const audio = document.createElement('audio');
			expect(() => playlistService.currentPlayerMediaInfo$.next({ media: audio, audioInfoKey: 'k', state$$$: null as never })).not.toThrow();
		});

		it('tracks fullscreen state for the floating player on fullscreenchange', () => {
			playlistService.currentItem.set({ mediaType: 'video', mediaUrl: 'sp://video' });
			const fixture = build();
			fixture.detectChanges();

			const floatingVideoPlayer = fixture.componentInstance.floatingVideoPlayer()?.nativeElement as HTMLElement;
			expect(floatingVideoPlayer).toBeTruthy();

			Object.defineProperty(document, 'fullscreenElement', { configurable: true, value: floatingVideoPlayer });
			document.dispatchEvent(new Event('fullscreenchange'));
			expect(fixture.componentInstance.isFloatingVideoFullscreen()).toBe(true);

			Object.defineProperty(document, 'fullscreenElement', { configurable: true, value: null });
			document.dispatchEvent(new Event('fullscreenchange'));
			expect(fixture.componentInstance.isFloatingVideoFullscreen()).toBe(false);
		});

		it('toggleFloatingVideoFullscreen does nothing without a floating player', async () => {
			const fixture = build();
			fixture.detectChanges();
			await fixture.componentInstance.toggleFloatingVideoFullscreen();
			// no throw, nothing to assert beyond it resolving cleanly
		});

		it('toggleFloatingVideoFullscreen requests fullscreen when not currently fullscreen', async () => {
			playlistService.currentItem.set({ mediaType: 'video', mediaUrl: 'sp://video' });
			const fixture = build();
			fixture.detectChanges();

			const floatingVideoPlayer = fixture.componentInstance.floatingVideoPlayer()?.nativeElement as HTMLElement;
			const requestFullscreenSpy = vi.fn().mockResolvedValue(undefined);
			floatingVideoPlayer.requestFullscreen = requestFullscreenSpy;

			await fixture.componentInstance.toggleFloatingVideoFullscreen();

			expect(requestFullscreenSpy).toHaveBeenCalled();
		});

		it('toggleFloatingVideoFullscreen exits fullscreen when the floating player is the fullscreen element', async () => {
			playlistService.currentItem.set({ mediaType: 'video', mediaUrl: 'sp://video' });
			const fixture = build();
			fixture.detectChanges();

			const floatingVideoPlayer = fixture.componentInstance.floatingVideoPlayer()?.nativeElement as HTMLElement;
			Object.defineProperty(document, 'fullscreenElement', { configurable: true, value: floatingVideoPlayer });
			const exitFullscreenSpy = vi.fn().mockResolvedValue(undefined);
			document.exitFullscreen = exitFullscreenSpy;

			await fixture.componentInstance.toggleFloatingVideoFullscreen();

			expect(exitFullscreenSpy).toHaveBeenCalled();
			Object.defineProperty(document, 'fullscreenElement', { configurable: true, value: null });
		});

		it('toggleFloatingVideoFullscreen swallows a rejected fullscreen request', async () => {
			playlistService.currentItem.set({ mediaType: 'video', mediaUrl: 'sp://video' });
			const fixture = build();
			fixture.detectChanges();

			const floatingVideoPlayer = fixture.componentInstance.floatingVideoPlayer()?.nativeElement as HTMLElement;
			floatingVideoPlayer.requestFullscreen = vi.fn().mockRejectedValue(new Error('denied'));

			await expect(fixture.componentInstance.toggleFloatingVideoFullscreen()).resolves.toBeUndefined();
		});
	});
});
