import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { PlaylistDetails, PlaylistService } from '@foundation/media/play/state';
import { PlayPlaylistButtonComponent } from './play-playlist-button.component';

const playlist: PlaylistDetails = {
	id: 'playlist-1',
	title: 'A playlist',
	theme: { backgroundColor: '', textColor: '' },
	items: [
		{ id: 'item-1', title: 'One', mediaUrl: 'sp://one', mediaType: 'audio', theme: { backgroundColor: '', textColor: '' } },
		{ id: 'item-2', title: 'Two', mediaUrl: 'sp://two', mediaType: 'audio', theme: { backgroundColor: '', textColor: '' } },
	],
};

describe('PlayPlaylistButtonComponent', () => {
	let playlistService: {
		currentPlaylistHash: ReturnType<typeof signal>;
		currentItem: ReturnType<typeof signal>;
		currentPlayingState: ReturnType<typeof signal>;
		generatePlaylistHash: ReturnType<typeof vi.fn>;
		setPlaylist: ReturnType<typeof vi.fn>;
		pause: ReturnType<typeof vi.fn>;
	};

	const build = () => {
		TestBed.configureTestingModule({
			imports: [PlayPlaylistButtonComponent],
			providers: [{ provide: PlaylistService, useValue: playlistService }],
		});
		return TestBed.createComponent(PlayPlaylistButtonComponent);
	};

	beforeEach(() => {
		playlistService = {
			currentPlaylistHash: signal(''),
			currentItem: signal(null),
			currentPlayingState: signal<'pause' | 'play' | 'stop' | 'idle'>('idle'),
			generatePlaylistHash: vi.fn((p: PlaylistDetails) => `hash:${p.id}`),
			setPlaylist: vi.fn(),
			pause: vi.fn(),
		};
	});

	describe('playlistForPlayback', () => {
		it('is null without a playlist input', () => {
			const fixture = build();
			fixture.detectChanges();
			expect(fixture.componentInstance.playlistForPlayback()).toBeNull();
		});

		it('applies the resolved theme colors to the playlist and every item', () => {
			const fixture = build();
			fixture.componentRef.setInput('playlist', playlist);
			fixture.componentRef.setInput('backgroundColor', '#123456');
			fixture.componentRef.setInput('textColor', '#654321');
			fixture.detectChanges();

			const themed = fixture.componentInstance.playlistForPlayback();
			expect(themed?.theme).toEqual({ backgroundColor: '#123456', textColor: '#654321' });
			expect(themed?.items.every((item) => item.theme.backgroundColor === '#123456')).toBe(true);
		});
	});

	describe('beingPlayed', () => {
		it('is false when nothing is playing', () => {
			const fixture = build();
			fixture.componentRef.setInput('playlist', playlist);
			fixture.detectChanges();
			expect(fixture.componentInstance.beingPlayed()).toBe(false);
		});

		it('is false when a different playlist is currently playing', () => {
			const fixture = build();
			fixture.componentRef.setInput('playlist', playlist);
			fixture.detectChanges();

			playlistService.currentPlaylistHash.set('hash:some-other-playlist');
			playlistService.currentPlayingState.set('play');

			expect(fixture.componentInstance.beingPlayed()).toBe(false);
		});

		it('is true when this playlist is current, the item at the start index matches, and it is playing', () => {
			const fixture = build();
			fixture.componentRef.setInput('playlist', playlist);
			fixture.detectChanges();

			const hash = playlistService.generatePlaylistHash(fixture.componentInstance.playlistForPlayback());
			playlistService.currentPlaylistHash.set(hash);
			playlistService.currentItem.set(playlist.items[0] as never);
			playlistService.currentPlayingState.set('play');

			expect(fixture.componentInstance.beingPlayed()).toBe(true);
		});

		it('respects a non-zero playlistStartIndex', () => {
			const fixture = build();
			fixture.componentRef.setInput('playlist', playlist);
			fixture.componentRef.setInput('playlistStartIndex', 1);
			fixture.detectChanges();

			const hash = playlistService.generatePlaylistHash(fixture.componentInstance.playlistForPlayback());
			playlistService.currentPlaylistHash.set(hash);
			playlistService.currentPlayingState.set('play');

			playlistService.currentItem.set(playlist.items[0] as never);
			expect(fixture.componentInstance.beingPlayed()).toBe(false);

			playlistService.currentItem.set(playlist.items[1] as never);
			expect(fixture.componentInstance.beingPlayed()).toBe(true);
		});

		it('is false when the matching hash has no current item at all', () => {
			const fixture = build();
			fixture.componentRef.setInput('playlist', playlist);
			fixture.detectChanges();

			const hash = playlistService.generatePlaylistHash(fixture.componentInstance.playlistForPlayback());
			playlistService.currentPlaylistHash.set(hash);
			playlistService.currentPlayingState.set('play');

			expect(fixture.componentInstance.beingPlayed()).toBe(false);
		});
	});

	describe('playFile / pauseFile', () => {
		it('does nothing without a playlist', () => {
			const fixture = build();
			fixture.detectChanges();
			fixture.componentInstance.playFile();
			expect(playlistService.setPlaylist).not.toHaveBeenCalled();
		});

		it('starts the themed playlist at the given start index', () => {
			const fixture = build();
			fixture.componentRef.setInput('playlist', playlist);
			fixture.componentRef.setInput('playlistStartIndex', 1);
			fixture.detectChanges();

			fixture.componentInstance.playFile();

			expect(playlistService.setPlaylist).toHaveBeenCalledTimes(1);
			const [themedPlaylist, autoPlay, startIndex] = playlistService.setPlaylist.mock.calls[0];
			expect(themedPlaylist.id).toBe('playlist-1');
			expect(autoPlay).toBe(true);
			expect(startIndex).toBe(1);
		});

		it('delegates pausing', () => {
			const fixture = build();
			fixture.detectChanges();
			fixture.componentInstance.pauseFile();
			expect(playlistService.pause).toHaveBeenCalled();
		});
	});

	describe('adjustBrightness', () => {
		it('lightens a hex color', () => {
			const fixture = build();
			fixture.detectChanges();
			expect(fixture.componentInstance.adjustBrightness('#808080', 50)).toBe('rgb(192, 192, 192)');
		});

		it('returns non-hex colors unchanged', () => {
			const fixture = build();
			fixture.detectChanges();
			expect(fixture.componentInstance.adjustBrightness('var(--color-primary)', 50)).toBe('var(--color-primary)');
		});
	});

	describe('theme color resolution', () => {
		it('keeps a css variable default as-is when jsdom has nothing to resolve it to', () => {
			const fixture = build();
			fixture.componentRef.setInput('playlist', playlist);
			fixture.detectChanges();

			expect(fixture.componentInstance.playlistForPlayback()?.theme).toEqual({ backgroundColor: 'var(--color-primary)', textColor: 'var(--color-primary-content)' });
		});

		it('falls back to the final fallback color for a transparent background', () => {
			const fixture = build();
			fixture.componentRef.setInput('playlist', playlist);
			fixture.componentRef.setInput('backgroundColor', 'transparent');
			fixture.detectChanges();

			expect(fixture.componentInstance.playlistForPlayback()?.theme.backgroundColor).toBe('#f43f5e');
		});
	});
});
