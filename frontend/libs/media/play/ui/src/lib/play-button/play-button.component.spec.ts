import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { EntityFile } from '@foundation/files/models';
import { FilesRepository } from '@foundation/files/state';
import { PlaylistService } from '@foundation/media/play/state';
import { of, Subject } from 'rxjs';
import { PlayButtonComponent } from './play-button.component';

const file: EntityFile = {
	id: 'file-1',
	kind: 'audio',
	publicFilename: 'Recording.mp3',
	inStorage: true,
	extra: {},
	config: {},
};

describe('PlayButtonComponent', () => {
	let getObjectById$$$: ReturnType<typeof vi.fn>;
	let playlistService: { currentItem: ReturnType<typeof signal>; currentPlayingState: ReturnType<typeof signal>; setPlaylist: ReturnType<typeof vi.fn>; pause: ReturnType<typeof vi.fn> };

	const build = () => {
		TestBed.configureTestingModule({
			imports: [PlayButtonComponent],
			providers: [
				{ provide: FilesRepository, useValue: { store: { getObjectById$$$ } } },
				{ provide: PlaylistService, useValue: playlistService },
			],
		});
		return TestBed.createComponent(PlayButtonComponent);
	};

	beforeEach(() => {
		getObjectById$$$ = vi.fn().mockReturnValue({ $: of(null) });
		playlistService = {
			currentItem: signal(null),
			currentPlayingState: signal<'pause' | 'play' | 'stop' | 'idle'>('idle'),
			setPlaylist: vi.fn(),
			pause: vi.fn(),
		};
	});

	describe('building the playlist from an entity file', () => {
		it('builds a one-item playlist once the audio/video file resolves', () => {
			const source = new Subject<EntityFile | null>();
			getObjectById$$$.mockReturnValue({ $: source.asObservable() });
			const fixture = build();
			fixture.componentRef.setInput('entityFileId', 'file-1');
			fixture.detectChanges();

			expect(getObjectById$$$).toHaveBeenCalledWith('file-1', true, true);

			source.next(file);
			fixture.detectChanges();

			const playlist = fixture.componentInstance.oneFileplaylist();
			expect(playlist?.items).toHaveLength(1);
			expect(playlist?.items[0].id).toBe('file-1');
			expect(playlist?.items[0].mediaType).toBe('audio');
			expect(playlist?.items[0].title).toBe('Recording.mp3');
		});

		it('ignores a file that is neither audio nor video', () => {
			const source = new Subject<EntityFile | null>();
			getObjectById$$$.mockReturnValue({ $: source.asObservable() });
			const fixture = build();
			fixture.componentRef.setInput('entityFileId', 'file-1');
			fixture.detectChanges();

			source.next({ ...file, kind: 'image' });
			fixture.detectChanges();

			expect(fixture.componentInstance.oneFileplaylist()).toBeNull();
		});

		it('prefers the explicit title input over the filename', () => {
			const source = new Subject<EntityFile | null>();
			getObjectById$$$.mockReturnValue({ $: source.asObservable() });
			const fixture = build();
			fixture.componentRef.setInput('entityFileId', 'file-1');
			fixture.componentRef.setInput('title', 'Custom Title');
			fixture.detectChanges();

			source.next(file);
			fixture.detectChanges();

			expect(fixture.componentInstance.oneFileplaylist()?.items[0].title).toBe('Custom Title');
		});

		it('forces the mediaType input over the file kind', () => {
			const source = new Subject<EntityFile | null>();
			getObjectById$$$.mockReturnValue({ $: source.asObservable() });
			const fixture = build();
			fixture.componentRef.setInput('entityFileId', 'file-1');
			fixture.componentRef.setInput('mediaType', 'audio');
			fixture.detectChanges();

			source.next({ ...file, kind: 'video' });
			fixture.detectChanges();

			expect(fixture.componentInstance.oneFileplaylist()?.items[0].mediaType).toBe('audio');
		});
	});

	// The playlist-building pipeline is gated by entityFileId's filtered observable: with no
	// entityFileId at all, that source of the combineLatest never emits, so nothing downstream
	// (including a medialUrl-only playlist) is ever built.
	it('never builds a playlist from medialUrl alone, without an entityFileId', () => {
		const fixture = build();
		fixture.componentRef.setInput('medialUrl', 'sp://abc');
		fixture.detectChanges();

		expect(getObjectById$$$).not.toHaveBeenCalled();
		expect(fixture.componentInstance.oneFileplaylist()).toBeNull();
	});

	it('prefers medialUrl over the fetched entity file once an entityFileId also unblocks the pipeline', () => {
		const fixture = build();
		fixture.componentRef.setInput('entityFileId', 'file-1');
		fixture.componentRef.setInput('medialUrl', 'sp://abc');
		fixture.componentRef.setInput('title', 'Direct media');
		fixture.detectChanges();

		expect(getObjectById$$$).toHaveBeenCalledWith('file-1', true, true);
		const playlist = fixture.componentInstance.oneFileplaylist();
		expect(playlist?.items[0].id).toBe('sp://abc');
		expect(playlist?.items[0].title).toBe('Direct media');
		expect(playlist?.items[0].mediaType).toBe('audio');
	});

	describe('beingPlayed', () => {
		it('is false when nothing is playing yet', () => {
			const fixture = build();
			fixture.detectChanges();
			expect(fixture.componentInstance.beingPlayed()).toBe(false);
		});

		it('is true once the playlist item matches the current item and playback state is play', () => {
			const fixture = build();
			fixture.componentRef.setInput('entityFileId', 'file-1');
			fixture.componentRef.setInput('medialUrl', 'sp://abc');
			fixture.detectChanges();

			playlistService.currentItem.set({ id: 'sp://abc' } as never);
			playlistService.currentPlayingState.set('play');

			expect(fixture.componentInstance.beingPlayed()).toBe(true);
		});

		it('is false when the current item differs from this button’s item', () => {
			const fixture = build();
			fixture.componentRef.setInput('entityFileId', 'file-1');
			fixture.componentRef.setInput('medialUrl', 'sp://abc');
			fixture.detectChanges();

			playlistService.currentItem.set({ id: 'sp://other' } as never);
			playlistService.currentPlayingState.set('play');

			expect(fixture.componentInstance.beingPlayed()).toBe(false);
		});

		it('is false when playback is paused even for the matching item', () => {
			const fixture = build();
			fixture.componentRef.setInput('entityFileId', 'file-1');
			fixture.componentRef.setInput('medialUrl', 'sp://abc');
			fixture.detectChanges();

			playlistService.currentItem.set({ id: 'sp://abc' } as never);
			playlistService.currentPlayingState.set('pause');

			expect(fixture.componentInstance.beingPlayed()).toBe(false);
		});
	});

	describe('playFile / pauseFile', () => {
		it('does nothing when there is no playlist yet', () => {
			const fixture = build();
			fixture.detectChanges();
			fixture.componentInstance.playFile();
			expect(playlistService.setPlaylist).not.toHaveBeenCalled();
		});

		it('hands the themed playlist to the playlist service, starting at the beginning', () => {
			const fixture = build();
			fixture.componentRef.setInput('entityFileId', 'file-1');
			fixture.componentRef.setInput('medialUrl', 'sp://abc');
			fixture.detectChanges();

			fixture.componentInstance.playFile();

			expect(playlistService.setPlaylist).toHaveBeenCalledTimes(1);
			const [playlist, autoPlay, startIndex, startTime] = playlistService.setPlaylist.mock.calls[0];
			expect(playlist.items[0].id).toBe('sp://abc');
			expect(autoPlay).toBe(true);
			expect(startIndex).toBe(0);
			expect(startTime).toBe(0);
		});

		it('delegates pausing to the playlist service', () => {
			const fixture = build();
			fixture.detectChanges();
			fixture.componentInstance.pauseFile();
			expect(playlistService.pause).toHaveBeenCalled();
		});
	});

	describe('adjustBrightness', () => {
		it('lightens a hex color for a positive percent', () => {
			const fixture = build();
			fixture.detectChanges();
			expect(fixture.componentInstance.adjustBrightness('#808080', 50)).toBe('rgb(192, 192, 192)');
		});

		it('darkens a hex color for a negative percent', () => {
			const fixture = build();
			fixture.detectChanges();
			expect(fixture.componentInstance.adjustBrightness('#808080', -20)).toBe('rgb(102, 102, 102)');
		});

		it('clamps channel values to the 0-255 range', () => {
			const fixture = build();
			fixture.detectChanges();
			expect(fixture.componentInstance.adjustBrightness('#ffffff', 50)).toBe('rgb(255, 255, 255)');
		});

		it('returns non-hex colors unchanged', () => {
			const fixture = build();
			fixture.detectChanges();
			expect(fixture.componentInstance.adjustBrightness('var(--color-primary)', 50)).toBe('var(--color-primary)');
		});
	});

	describe('theme color resolution', () => {
		it('keeps a css variable as-is when jsdom has nothing to resolve it to', () => {
			const fixture = build();
			fixture.componentRef.setInput('entityFileId', 'file-1');
			fixture.componentRef.setInput('medialUrl', 'sp://abc');
			fixture.detectChanges();

			const theme = fixture.componentInstance.oneFileplaylist()?.theme;
			expect(theme).toEqual({ backgroundColor: 'var(--color-primary)', textColor: 'var(--color-primary-content)' });
		});

		it('keeps an explicit hex color as-is', () => {
			const fixture = build();
			fixture.componentRef.setInput('entityFileId', 'file-1');
			fixture.componentRef.setInput('medialUrl', 'sp://abc');
			fixture.componentRef.setInput('backgroundColor', '#123456');
			fixture.componentRef.setInput('textColor', '#654321');
			fixture.detectChanges();

			const theme = fixture.componentInstance.oneFileplaylist()?.theme;
			expect(theme).toEqual({ backgroundColor: '#123456', textColor: '#654321' });
		});

		it('falls back to the final fallback color for a transparent background in a detached element', () => {
			const fixture = build();
			fixture.componentRef.setInput('entityFileId', 'file-1');
			fixture.componentRef.setInput('medialUrl', 'sp://abc');
			fixture.componentRef.setInput('backgroundColor', 'transparent');
			fixture.detectChanges();

			expect(fixture.componentInstance.oneFileplaylist()?.theme.backgroundColor).toBe('#f43f5e');
		});
	});
});
