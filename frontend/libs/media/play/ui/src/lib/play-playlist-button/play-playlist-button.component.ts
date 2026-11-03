import { Component, computed, ElementRef, inject, input } from '@angular/core';
import { TwPauseIcon, TwPlayIcon } from '@foundation/icons';
import { PlaylistDetails, PlaylistService } from '@foundation/media/play/state';
import { getInheritedBackgroundColor, getInheritedTextColor } from '@foundation/utils';

@Component({
	selector: 'lib-play-playlist-button',

	templateUrl: './play-playlist-button.component.html',
	styleUrl: './play-playlist-button.component.css',
	standalone: true,
	imports: [TwPlayIcon, TwPauseIcon],
	host: {
		'[style.width]': 'buttonWidth()',
		'[style.height]': 'buttonHeight()',
	},
})
export class PlayPlaylistButtonComponent {
	private _el = inject(ElementRef<HTMLElement>);
	playlistService = inject(PlaylistService);

	title = input<string | null>(null);

	backgroundColor = input<string | null>(null);
	textColor = input<string | null>(null);

	playlist = input<PlaylistDetails | null>(null);
	playlistStartIndex = input<number>(0);

	buttonHeight = input<string | null>(null);
	buttonWidth = input<string | null>(null);

	playlistForPlayback = computed(() => {
		const playlist = this.playlist();
		return playlist ? this._withCurrentTheme(playlist) : null;
	});

	beingPlayed = computed(() => {
		const currentPlaylistBeingPlayedHash = this.playlistService.currentPlaylistHash();
		const playlist = this.playlistForPlayback();
		if (!playlist) return false;
		const playlistHash = this.playlistService.generatePlaylistHash(playlist);

		if (currentPlaylistBeingPlayedHash !== playlistHash) return false;

		const playlistItem = playlist.items[this.playlistStartIndex()];
		const currentItem = this.playlistService.currentItem();
		if (!playlistItem || !currentItem || playlistItem.id !== currentItem.id) return false;

		return this.playlistService.currentPlayingState() === 'play';
	});

	playFile() {
		const playlist = this.playlistForPlayback();
		if (!playlist) return;
		this.playlistService.setPlaylist(playlist, true, this.playlistStartIndex());
	}

	/**
	 * Start this episode at a given moment -- what clicking a line of its transcript asks for.
	 *
	 * It has to go through the button rather than through the service directly: the playlist is
	 * identified by a hash that includes the theme this button resolves from its own position in
	 * the page, so a caller handing the service an unthemed copy sets a hash no button recognises,
	 * and every row then renders as stopped while one of them plays.
	 */
	playFromTime(seconds: number) {
		const playlist = this.playlistForPlayback();
		if (!playlist) return;
		this.playlistService.setPlaylist(playlist, true, this.playlistStartIndex(), seconds);
	}

	pauseFile() {
		this.playlistService.pause();
	}

	adjustBrightness(color: string, percent: number): string {
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
		let resolvedColor = color.trim();

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
