import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, computed, effect, inject, input, signal, untracked, viewChild } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { TwPauseIcon, TwPlayIcon } from '@foundation/icons';
import { PlayerMediaInfo, PlayerService } from '@foundation/media/play/state';
import { filter, switchMap, tap } from 'rxjs';
import { SeekBarComponent } from '../seek-bar/seek-bar.component';

let inlinePlayerCounter = 0;

/**
 * Self-contained inline player: plays a single media in place, using its own
 * media element from the shared PlayerService (never the global root player).
 */
@Component({
	selector: 'lib-inline-player',
	standalone: true,
	imports: [SeekBarComponent, TwPlayIcon, TwPauseIcon],
	styles: [':host{display:block;width:100%}'],
	template: `
		<div class="flex w-full flex-col gap-2">
			@if (mediaType() === 'video') {
				<div class="border-base-300 bg-base-200/40 relative aspect-video w-full overflow-hidden rounded-xl border">
					<div
						#videoHost
						class="h-full w-full"
					></div>
					@if (!playing()) {
						<button
							type="button"
							class="absolute inset-0 z-10 flex items-center justify-center bg-black/10"
							[attr.aria-label]="'Play'"
							(click)="toggle()"
						>
							<span
								class="flex items-center justify-center rounded-full drop-shadow-lg"
								[style.width]="'56px'"
								[style.height]="'56px'"
								[style.backgroundColor]="backgroundColor()"
								[style.color]="textColor()"
							>
								<tw-play class="h-3/5 w-3/5" />
							</span>
						</button>
					}
				</div>
			}

			<div class="flex items-center gap-3">
				<button
					type="button"
					class="flex shrink-0 items-center justify-center rounded-full drop-shadow-sm"
					[attr.aria-label]="playing() ? 'Pause' : 'Play'"
					[style.width]="'44px'"
					[style.height]="'44px'"
					[style.backgroundColor]="backgroundColor()"
					[style.color]="textColor()"
					(click)="toggle()"
				>
					@if (playing()) {
						<tw-pause class="h-2/5 w-2/5" />
					} @else {
						<tw-play class="h-2/5 w-2/5" />
					}
				</button>

				<lib-seek-bar
					class="min-w-0 flex-1"
					[currentTime]="currentTime()"
					[duration]="duration()"
					[bufferedEnd]="bufferedEnd()"
					[loading]="loading()"
					[hasError]="hasError()"
					[progressColor]="backgroundColor()"
					[thumbColor]="backgroundColor()"
					(seek)="seek($event)"
				></lib-seek-bar>
			</div>
		</div>
	`,
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InlinePlayerComponent {
	private _player = inject(PlayerService);
	private _destroyRef = inject(DestroyRef);

	mediaUrl = input.required<string>();
	mediaType = input.required<'audio' | 'video'>();
	backgroundColor = input<string>('var(--color-primary)');
	textColor = input<string>('var(--color-primary-content)');

	private _key = `inline-player-${inlinePlayerCounter++}`;
	private _mediaInfo = signal<PlayerMediaInfo | null>(null);

	private _videoHost = viewChild<ElementRef<HTMLDivElement>>('videoHost');

	playing = signal(false);
	currentTime = signal(0);
	duration = signal(0);
	bufferedEnd = signal(0);
	canPlay = signal(false);
	hasError = signal(false);

	loading = computed(() => !!this._mediaInfo() && !this.canPlay() && !this.hasError());

	constructor() {
		effect(() => {
			const url = this.mediaUrl();
			const type = this.mediaType();
			untracked(() => this._teardown());
			if (!url) return;
			this._mediaInfo.set(this._player.getOrCreateMediaInfo(this._key, url, type));
		});

		effect(() => {
			const mediaInfo = this._mediaInfo();
			const videoHost = this._videoHost();
			if (!mediaInfo || !videoHost || this.mediaType() !== 'video') return;
			const media = mediaInfo.media;
			media.style.width = '100%';
			media.style.height = '100%';
			media.style.objectFit = 'contain';
			media.controls = false;
			videoHost.nativeElement.replaceChildren(media);
		});

		toObservable(this._mediaInfo)
			.pipe(
				takeUntilDestroyed(),
				filter((mediaInfo): mediaInfo is PlayerMediaInfo => !!mediaInfo),
				switchMap((mediaInfo) => mediaInfo.state$$$.$),
				tap((state) => {
					this.playing.set(state.playing);
					this.currentTime.set(state.currentTime ?? 0);
					this.duration.set(state.duration ?? 0);
					this.canPlay.set(state.canplay);
					this.hasError.set(state.error);
				})
			)
			.subscribe();

		this._destroyRef.onDestroy(() => this._teardown());
	}

	toggle(): void {
		const mediaInfo = this._mediaInfo();
		if (!mediaInfo) return;
		if (mediaInfo.media.paused) {
			this._player.__pauseAllMedia();
			this._player.__playMedia(mediaInfo);
		} else {
			this._player.__pauseMedia(mediaInfo);
		}
	}

	seek(time: number): void {
		const mediaInfo = this._mediaInfo();
		if (mediaInfo) this._player.__seek(mediaInfo, time);
	}

	private _teardown(): void {
		const mediaInfo = this._mediaInfo();
		if (!mediaInfo) return;
		this._player.deleteMediaInfo(mediaInfo);
		this._mediaInfo.set(null);
	}
}
