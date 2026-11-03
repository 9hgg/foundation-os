import { ChangeDetectionStrategy, Component, computed, ElementRef, inject, input, signal, viewChild } from '@angular/core';
import { TwCrossIcon } from '@foundation/icons';
import { PlaylistService } from '@foundation/media/play/state';
import { combineLatest, fromEvent, tap } from 'rxjs';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { SeekBarComponent } from '../seek-bar/seek-bar.component';

@Component({
	selector: 'lib-playlist-bar',
	standalone: true,
	imports: [TwCrossIcon, SeekBarComponent],
	templateUrl: './playlist-bar.component.html',
	styleUrls: ['./playlist-bar.component.css'],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PlaylistBarComponent {
	floatingVideoPlayer = viewChild<ElementRef<HTMLDivElement>>('floatingVideoPlayer');
	floatingVideoContainer = viewChild<ElementRef<HTMLDivElement>>('floatingVideoContainer');

	playlistService = inject(PlaylistService);

	displayRepeatButton = signal<boolean>(false);
	displayNextButton = signal<boolean>(true);
	displayPrevButton = signal<boolean>(true);
	displayShuffleButton = signal<boolean>(false);
	isFloatingVideoFullscreen = signal<boolean>(false);

	/** Render the seek bar as a waveform of the current media (opt-in: extra fetch/decode). */
	useWaveform = input<boolean>(false);

	/** Seconds skipped by the rewind/forward buttons. */
	readonly skipSeconds = 10;
	/** Playback speeds cycled through by the speed button. */
	private readonly _playbackRates = [1, 1.25, 1.5, 2, 0.5];

	/** Whether sound is effectively off (muted or volume at zero). */
	isSilent = computed(() => this.playlistService.muted() || this.playlistService.volume() === 0);

	/** Media URL fed to the seek bar's waveform variant (null disables it). */
	waveformMediaUrl = computed(() => (this.useWaveform() ? (this.playlistService.currentItem()?.mediaUrl ?? null) : null));

	/** Still loading: a play is desired/active but the media can't play yet (and no error). */
	isLoading = computed(() => !!this.playlistService.currentItem() && !this.playlistService.canPlay() && !this.playlistService.hasError());

	constructor() {
		combineLatest([this.playlistService.currentPlayerMediaInfo$, toObservable(this.floatingVideoContainer)])
			.pipe(
				takeUntilDestroyed(),
				tap(([mediaInfo, floatingVideoContainer]) => {
					if (mediaInfo && floatingVideoContainer) {
						// if mediaInfo.media is a HTMLVideoElement
						if (mediaInfo.media instanceof HTMLVideoElement) {
							const videoElement = mediaInfo.media;
							videoElement.controls = false;
							videoElement.style.display = 'block';
							videoElement.style.width = '100%';
							videoElement.style.height = '100%';
							videoElement.style.objectFit = 'contain';
							// append the video element to the floating mini-player
							floatingVideoContainer.nativeElement.replaceChildren(videoElement);
						}
					}
				})
			)
			.subscribe();

		fromEvent(document, 'fullscreenchange')
			.pipe(
				takeUntilDestroyed(),
				tap(() => {
					const floatingVideoPlayer = this.floatingVideoPlayer()?.nativeElement;
					this.isFloatingVideoFullscreen.set(!!floatingVideoPlayer && document.fullscreenElement === floatingVideoPlayer);
				})
			)
			.subscribe();
	}

	onSeek(time: number) {
		this.playlistService.seek(time);
	}

	skipBackward() {
		this.playlistService.skip(-this.skipSeconds);
	}

	skipForward() {
		this.playlistService.skip(this.skipSeconds);
	}

	onVolumeInput(event: Event) {
		const target = event.target;
		if (!(target instanceof HTMLInputElement)) return;
		this.playlistService.setVolume(Number(target.value));
	}

	toggleMute() {
		this.playlistService.toggleMute();
	}

	async toggleFloatingVideoFullscreen(): Promise<void> {
		const floatingVideoPlayer = this.floatingVideoPlayer()?.nativeElement;
		if (!floatingVideoPlayer) return;

		try {
			if (document.fullscreenElement === floatingVideoPlayer) {
				await document.exitFullscreen();
				return;
			}

			await floatingVideoPlayer.requestFullscreen();
		} catch (err) {
			console.error('Failed to toggle fullscreen video player: ', err);
		}
	}

	cyclePlaybackRate() {
		const currentRate = this.playlistService.playbackRate();
		const currentIndex = this._playbackRates.indexOf(currentRate);
		const nextRate = this._playbackRates[(currentIndex + 1) % this._playbackRates.length];
		this.playlistService.setPlaybackRate(nextRate);
	}

	stopAndClose() {
		this.playlistService.stopAndClose();
	}

	next() {
		this.playlistService.next();
	}

	prev() {
		this.playlistService.prev();
	}
}
