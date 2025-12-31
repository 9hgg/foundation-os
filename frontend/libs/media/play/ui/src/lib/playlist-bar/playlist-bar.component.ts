import { mean } from 'lodash-es';

import { AfterViewInit, ChangeDetectionStrategy, Component, effect, ElementRef, inject, input, signal, viewChild } from '@angular/core';
import { LayoutService } from '@foundation/app/layout';
import { TwCrossIcon } from '@foundation/icons';
import { PlaylistService } from '@foundation/media/play/state';
import { DurationPipe } from '@foundation/utils';
import { combineLatest, tap } from 'rxjs';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';

@Component({
	selector: 'lib-playlist-bar',
	standalone: true,
	imports: [DurationPipe, TwCrossIcon],
	templateUrl: './playlist-bar.component.html',
	styleUrls: ['./playlist-bar.component.css'],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PlaylistBarComponent implements AfterViewInit {
	private _layoutService = inject(LayoutService);

	seekBarRef = viewChild.required<ElementRef<HTMLDivElement>>('seekBar');
	progressBarRef = viewChild.required<ElementRef<HTMLDivElement>>('progressBar');
	floatingSquare = viewChild<ElementRef<HTMLDivElement>>('floatingSquare');

	playlistService = inject(PlaylistService);
	backgroundBarColor = input<string>('var(--spoken-deep-gray)');
	// backgroundColor = input<string>('#f1f1f1');
	// playBarColor = input<string>('#f00');
	progressBarColor = input<string>('var(--spoken-teal)');

	displayRepeatButton = signal<boolean>(false);
	displayNextButton = signal<boolean>(true);
	displayPrevButton = signal<boolean>(true);
	displayShuffleButton = signal<boolean>(false);

	constructor() {
		effect(() => {
			const currentTime = this.playlistService.currentTime();
			const currentItemDuration = this.playlistService.currentItemDuration();
			const percent = currentTime / currentItemDuration;
			this.progressBarRef().nativeElement.style.width = percent * 100 + '%';
		});

		combineLatest([this.playlistService.currentPlayerMediaInfo$, toObservable(this.floatingSquare)])
			.pipe(
				takeUntilDestroyed(),
				tap(([mediaInfo, floatingSquare]) => {
					console.log('[PlaylistBar] mediaInfo:', mediaInfo);
					if (mediaInfo && floatingSquare) {
						// if mediaInfo.media is a HTMLVideoElement
						if (mediaInfo.media instanceof HTMLVideoElement) {
							// append the video element to the floatingSquare
							floatingSquare.nativeElement.replaceChildren(mediaInfo.media);
						}
					}
				})
			)
			.subscribe();
	}

	ngAfterViewInit() {
		console.log('[PlaylistBarComponent] ngAfterViewInit');

		this.seekBarRef().nativeElement.addEventListener('click', (event) => {
			console.log('click');

			this.seek(event);
		});
		this.seekBarRef().nativeElement.addEventListener('dblclick', (event) => {
			console.log('dblclick');
			this.seek(event, true);
		});
	}

	seek(e: MouseEvent, forcePlay = false) {
		const percent = e.offsetX / this.seekBarRef().nativeElement.offsetWidth;
		console.log('seeking at', percent, this.playlistService.currentItemDuration() * percent);
		this.playlistService.seek(this.playlistService.currentItemDuration() * percent);
		// this.currentTime.set(percent * this.duration());
		if (forcePlay) this.playlistService.play();
	}

	stopAndClose() {
		this.playlistService.stop();
		this._layoutService.displayRootPlayer(false);
	}

	next() {
		this.playlistService.next();
	}

	prev() {
		this.playlistService.prev();
	}
}
