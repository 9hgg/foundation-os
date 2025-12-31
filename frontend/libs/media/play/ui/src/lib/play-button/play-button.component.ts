import { EntityFile } from '@foundation/files/models';
import { convertToUrl, FilesRepository } from '@foundation/files/state';
import { TwPauseIcon, TwPlayIcon } from '@foundation/icons';
import { PlaylistDetails, PlaylistService } from '@foundation/media/play/state';
import { getInheritedBackgroundColor, getInheritedTextColor } from '@foundation/utils';
import { Component, computed, ElementRef, inject, input, model, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { combineLatest, filter, map, switchMap, tap } from 'rxjs';

@Component({
	selector: 'lib-play-button',

	templateUrl: './play-button.component.html',
	styleUrl: './play-button.component.css',
	standalone: true,
	imports: [TwPlayIcon, TwPauseIcon],
	host: {
		'[style.width]': 'buttonWidth()',
		'[style.height]': 'buttonHeight()',
	},
})
export class PlayButtonComponent {
	private _el = inject(ElementRef<HTMLElement>);
	private _filesRepository = inject(FilesRepository);
	playlistService = inject(PlaylistService);

	entityFileId = input<string | null>(null);
	alternative = input<string>('default');
	fileDuration = model<number>(0);

	entityFile = signal<EntityFile | null>(null);
	medialUrl = input<string | null>(null);
	backgroundColor = input<string | null>(null);
	textColor = input<string | null>(null);
	borderColor = input<string | null>(null);
	title = input<string | null>(null);

	buttonHeight = input<string | null>(null);
	buttonWidth = input<string | null>(null);

	// set in the constructor
	oneFileplaylist = signal<PlaylistDetails | null>(null);

	beingPlayed = computed(() => {
		const currentItemBeingPlayed = this.playlistService.currentItem();
		const oneFileplaylist = this.oneFileplaylist();
		if (!currentItemBeingPlayed || !oneFileplaylist) return false;
		const same = currentItemBeingPlayed.id === oneFileplaylist.items[0].id;
		return same && this.playlistService.currentPlayingState() === 'play';
	});

	playFile() {
		const playlist = this.oneFileplaylist();
		console.log('playlist', playlist);

		if (!playlist) return;

		this.playlistService.setPlaylist(playlist, true, 0);
	}

	pauseFile() {
		this.playlistService.pause();
	}

	constructor() {
		combineLatest([
			//
			toObservable(this.entityFileId).pipe(
				filter((entityFileId): entityFileId is string => !!entityFileId),
				switchMap((entityFileId) => this._filesRepository.store.getObjectById$$$(entityFileId, true, true).$)
				// filter((f) => !!f)
			),
			toObservable(this.alternative),
			toObservable(this.textColor).pipe(
				map((textColor) => {
					let computedTextColor = textColor ?? 'inherit';
					if (!computedTextColor || computedTextColor === 'auto' || computedTextColor === 'inherit' || computedTextColor === 'transparent') {
						computedTextColor = getInheritedTextColor(this._el.nativeElement);
					}
					if (computedTextColor === 'rgba(0, 0, 0, 0)') {
						computedTextColor = 'black';
					}
					return computedTextColor;
				})
			),
			toObservable(this.backgroundColor).pipe(
				map((backgroundColor) => {
					let computedBackgroundColor = backgroundColor ?? 'inherit';
					if (!computedBackgroundColor || computedBackgroundColor === 'auto' || computedBackgroundColor === 'inherit' || computedBackgroundColor === 'transparent') {
						computedBackgroundColor = getInheritedBackgroundColor(this._el.nativeElement);
					}
					if (computedBackgroundColor === 'rgba(0, 0, 0, 0)') {
						computedBackgroundColor = 'white';
					}
					return computedBackgroundColor;
				})
			),
			toObservable(this.borderColor),
			toObservable(this.medialUrl),
			toObservable(this.title),
		])
			.pipe(
				takeUntilDestroyed(),

				map(([entityFile, alternative, textColor, backgroundColor, borderColor, medialUrl, title]) => {
					console.log({ entityFile, alternative, textColor, backgroundColor, borderColor, medialUrl, title });

					if (medialUrl) {
						const playlist: PlaylistDetails = {
							title: 'player',
							id: 'player',
							theme: {
								backgroundColor,
								textColor,
							},
							items: [
								{
									id: medialUrl,
									title: title ?? '',
									mediaUrl: convertToUrl(medialUrl),
									mediaType: 'audio',
								},
							],
						};

						return playlist;
					}

					if (entityFile && (entityFile.kind == 'audio' || entityFile.kind == 'video')) {
						const playlist: PlaylistDetails = {
							title: 'player',
							id: 'player',
							theme: {
								backgroundColor,
								textColor,
							},
							items: [
								{
									id: entityFile.id,
									title: title ?? entityFile.publicFilename ?? entityFile.originalFilename ?? '',
									mediaUrl: convertToUrl(entityFile, alternative),
									mediaType: entityFile.kind,
								},
							],
						};
						return playlist;
					}

					return null;
				}),
				tap((playlist) => {
					this.oneFileplaylist.set(playlist);
				})
			)
			.subscribe();
	}

	adjustBrightness(color: string, percent: number): string {
		// Simple brightness adjustment function
		// If it's a hex color, convert to rgb and adjust
		if (color.startsWith('#')) {
			const hex = color.slice(1);
			const r = parseInt(hex.slice(0, 2), 16);
			const g = parseInt(hex.slice(2, 4), 16);
			const b = parseInt(hex.slice(4, 6), 16);

			const factor = 1 + percent / 100;
			const newR = Math.min(255, Math.max(0, Math.round(r * factor)));
			const newG = Math.min(255, Math.max(0, Math.round(g * factor)));
			const newB = Math.min(255, Math.max(0, Math.round(b * factor)));

			return `rgb(${newR}, ${newG}, ${newB})`;
		}
		// For other color formats, return as-is
		return color;
	}
}
