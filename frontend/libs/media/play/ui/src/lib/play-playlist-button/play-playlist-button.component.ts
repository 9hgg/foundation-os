import { Component, computed, inject, input } from '@angular/core';
import { EntityFile } from '@foundation/files/models';
import { FilesRepository } from '@foundation/files/state';
import { TwPauseIcon, TwPlayIcon } from '@foundation/icons';
import { PlaylistDetails, PlaylistService } from '@foundation/media/play/state';

@Component({
	selector: 'lib-play-playlist-button',

	templateUrl: './play-playlist-button.component.html',
	styleUrl: './play-playlist-button.component.css',
	standalone: true,
	imports: [TwPlayIcon, TwPauseIcon],
})
export class PlayPlaylistButtonComponent {
	private _filesRepository = inject(FilesRepository);
	playlistService = inject(PlaylistService);

	title = input<string | null>(null);

	backgroundColor = input<string | null>(null);
	textColor = input<string | null>(null);

	playlist = input<PlaylistDetails | null>(null);

	beingPlayed = computed(() => {
		const currentPlaylistBeingPlayedHash = this.playlistService.currentPlaylistHash();
		const playlist = this.playlist();
		if (!playlist) return false;
		const playlistHash = this.playlistService.generatePlaylistHash(playlist);

		if (currentPlaylistBeingPlayedHash !== playlistHash) return false;

		return this.playlistService.currentPlayingState() === 'play';
	});

	playFile() {
		const playlist = this.playlist();
		if (!playlist) return;
		this.playlistService.setPlaylist(playlist, true);
	}

	pauseFile() {
		this.playlistService.pause();
	}
}
