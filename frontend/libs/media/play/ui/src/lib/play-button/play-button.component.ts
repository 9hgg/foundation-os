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

	/**
	 * Force how the media is played back, regardless of the underlying file's `kind`.
	 * Audio-only contexts (e.g. a mic recording stored as a `video/webm` blob) pass
	 * `'audio'` so the player doesn't pop up the floating video preview.
	 */
	mediaType = input<'audio' | 'video' | null>(null);

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

		const playlistWithCurrentTheme = this._withCurrentTheme(playlist);
		this.oneFileplaylist.set(playlistWithCurrentTheme);
		this.playlistService.setPlaylist(playlistWithCurrentTheme, true, 0, 0);
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
			toObservable(this.textColor),
			toObservable(this.backgroundColor),
			toObservable(this.borderColor),
			toObservable(this.medialUrl),
			toObservable(this.title),
		])
			.pipe(
				takeUntilDestroyed(),

				map(([entityFile, alternative, textColor, backgroundColor, borderColor, medialUrl, title]) => {
					console.log({ entityFile, alternative, textColor, backgroundColor, borderColor, medialUrl, title });

					const theme = this._resolveVisibleButtonTheme();

					if (medialUrl) {
						const playlist: PlaylistDetails = {
							title: 'player',
							id: 'player',
							theme,
							items: [
								{
									id: medialUrl,
									title: title ?? '',
									mediaUrl: convertToUrl(medialUrl),
									mediaType: 'audio',
									theme,
								},
							],
						};

						return playlist;
					}

					if (entityFile && (entityFile.kind == 'audio' || entityFile.kind == 'video')) {
						const playlist: PlaylistDetails = {
							title: 'player',
							id: 'player',
							theme,
							items: [
								{
									id: entityFile.id,
									title: title ?? entityFile.publicFilename ?? entityFile.originalFilename ?? '',
									mediaUrl: convertToUrl(entityFile, alternative),
									mediaType: this.mediaType() ?? entityFile.kind,
									theme,
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

	private _withCurrentTheme(playlist: PlaylistDetails): PlaylistDetails {
		const theme = this._resolveVisibleButtonTheme();
		return {
			...playlist,
			theme,
			items: playlist.items.map((item) => ({
				...item,
				theme,
			})),
		};
	}

	private _resolveVisibleButtonTheme(): { backgroundColor: string; textColor: string } {
		const rawBackgroundColor = this.backgroundColor() || 'var(--color-primary)';
		const rawTextColor = this.textColor() || 'var(--color-primary-content)';
		return {
			backgroundColor: this._resolveColor(rawBackgroundColor, getInheritedBackgroundColor(this._el.nativeElement), '#f43f5e'),
			textColor: this._resolveColor(rawTextColor, getInheritedTextColor(this._el.nativeElement), '#ffffff'),
		};
	}

	private _resolveColor(color: string, inheritedColor: string, finalFallback: string): string {
		let resolvedColor = color?.trim() || '';

		const cssVariableName = this._extractCssVariableName(resolvedColor);
		if (cssVariableName) {
			const cssVariableValue = getComputedStyle(this._el.nativeElement).getPropertyValue(cssVariableName).trim();
			if (cssVariableValue) {
				resolvedColor = cssVariableValue;
			}
		}

		if (this._needsFallbackColor(resolvedColor)) {
			resolvedColor = inheritedColor;
		}

		if (resolvedColor === 'rgba(0, 0, 0, 0)') {
			return finalFallback;
		}

		return resolvedColor || finalFallback;
	}

	private _needsFallbackColor(color: string): boolean {
		return !color || color === 'auto' || color === 'inherit' || color === 'transparent';
	}

	private _extractCssVariableName(color: string): string | null {
		const match = /^var\(\s*(--[^,\s)]+)/.exec(color);
		return match?.[1] ?? null;
	}
}
