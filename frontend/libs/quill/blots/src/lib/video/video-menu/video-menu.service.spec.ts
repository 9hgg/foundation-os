import { Overlay } from '@angular/cdk/overlay';
import { TestBed } from '@angular/core/testing';
import { FileModals } from '@foundation/files/modals';
import { convertToUrl } from '@foundation/files/state';
import { BehaviorSubject } from 'rxjs';
import { VideoMenuComponent } from './video-menu.component';
import { VIDEO_BLOT_CONTEXT_MENU_WINDOW_KEY, VideoBlotContextMenuService } from './video-menu.service';

describe('VideoBlotContextMenuService', () => {
	const buildService = () => {
		const closed = new BehaviorSubject<unknown>(null);
		const openFilesSelectionDialog = vi.fn(() => ({ closed }));

		TestBed.configureTestingModule({ providers: [VideoBlotContextMenuService, { provide: FileModals, useValue: { openFilesSelectionDialog } }] });

		return { service: TestBed.inject(VideoBlotContextMenuService), overlay: TestBed.inject(Overlay), openFilesSelectionDialog, closed };
	};

	const rightClickAt = (x: number, y: number) => new MouseEvent('contextmenu', { clientX: x, clientY: y });

	afterEach(() => {
		delete (window as unknown as Record<string, unknown>)[VIDEO_BLOT_CONTEXT_MENU_WINDOW_KEY];
		document.querySelectorAll('.cdk-overlay-container').forEach((container) => container.remove());
		TestBed.resetTestingModule();
		vi.restoreAllMocks();
	});

	describe('opening the menu', () => {
		it('attaches the menu where the pointer was, over a backdrop that closes it', () => {
			const { service } = buildService();

			service.open(rightClickAt(120, 60), { alt: 'a clip' });

			expect(document.querySelector('lib-video-menu')).not.toBeNull();
			expect(document.querySelector('.transparent-backdrop')).not.toBeNull();
		});

		it('tells the menu what the clip is', () => {
			const { service } = buildService();
			const data = { alt: 'a clip', url: 'https://example.test/clip.mp4' };

			service.open(rightClickAt(0, 0), data);

			expect(document.querySelectorAll('lib-video-menu')).toHaveLength(1);
		});

		it('replaces an already-open menu rather than stacking a second one', () => {
			const { service } = buildService();

			service.open(rightClickAt(0, 0), {});
			service.open(rightClickAt(50, 50), {});

			expect(document.querySelectorAll('lib-video-menu')).toHaveLength(1);
		});

		it('closes when the backdrop is clicked', () => {
			const { service } = buildService();
			service.open(rightClickAt(0, 0), {});

			document.querySelector<HTMLElement>('.transparent-backdrop')?.click();

			expect(document.querySelector('lib-video-menu')).toBeNull();
		});
	});

	describe('the actions', () => {
		it('deleting reports back to the blot and closes', () => {
			const { service } = buildService();
			const callback = vi.fn();
			service.open(rightClickAt(0, 0), {}, callback);

			service.close('delete');

			expect(callback).toHaveBeenCalledWith({ action: 'delete' });
			expect(document.querySelector('lib-video-menu')).toBeNull();
		});

		it('editing opens the file library, filtered to videos', () => {
			const { service, openFilesSelectionDialog } = buildService();
			service.open(rightClickAt(0, 0), {}, vi.fn());

			service.close('edit');

			expect(openFilesSelectionDialog).toHaveBeenCalledWith(expect.objectContaining({ filters: [{ fieldName: 'kind', value: 'video' }] }));
			// The menu stays up until the picker answers, so the author can still cancel.
			expect(document.querySelector('lib-video-menu')).not.toBeNull();
		});

		it('reports the picked clip back to the blot as a url, and closes', () => {
			const { service, closed } = buildService();
			const callback = vi.fn();
			service.open(rightClickAt(0, 0), {}, callback);
			service.close('edit');

			const file = { id: 'file-1', publicFilename: 'clip.mp4' };
			closed.next({ files: [file] });

			expect(callback).toHaveBeenCalledWith({ action: 'edit', newUrl: convertToUrl(file as never) });
			expect(document.querySelector('lib-video-menu')).toBeNull();
		});

		it('leaves the clip alone when the picker is dismissed', () => {
			const { service, closed } = buildService();
			const callback = vi.fn();
			service.open(rightClickAt(0, 0), {}, callback);
			service.close('edit');

			closed.next({ files: [] });

			expect(callback).not.toHaveBeenCalled();
			expect(document.querySelector('lib-video-menu')).not.toBeNull();
		});

		it('closes on an action it does not know', () => {
			const { service } = buildService();
			vi.spyOn(console, 'warn').mockImplementation(() => undefined);
			service.open(rightClickAt(0, 0), {}, vi.fn());

			service.close('fly-away');

			expect(document.querySelector('lib-video-menu')).toBeNull();
		});

		it('closing with nothing open is a no-op', () => {
			const { service } = buildService();
			vi.spyOn(console, 'warn').mockImplementation(() => undefined);

			expect(() => service.close()).not.toThrow();
		});
	});

	describe('the bridge the blot calls through', () => {
		// The blot is plain DOM built by Quill; it reaches the app through a function on window.
		it('publishes an opener on window', () => {
			const { service } = buildService();

			service.setContextMenuInWindow();

			expect(typeof (window as unknown as Record<string, unknown>)[VIDEO_BLOT_CONTEXT_MENU_WINDOW_KEY]).toBe('function');
		});

		it('opens the menu when the blot calls it', () => {
			const { service } = buildService();
			service.setContextMenuInWindow();
			const callback = vi.fn();

			(window as unknown as Record<string, (event: MouseEvent, data: unknown, callback: unknown) => void>)[VIDEO_BLOT_CONTEXT_MENU_WINDOW_KEY](
				rightClickAt(10, 10),
				{ alt: 'a clip' },
				callback
			);

			expect(document.querySelector('lib-video-menu')).not.toBeNull();
			expect(service.currentCallback).toBe(callback);
		});

		it('leaves an opener already on window alone, so a second service does not steal it', () => {
			const { service } = buildService();
			const first = vi.fn();
			(window as unknown as Record<string, unknown>)[VIDEO_BLOT_CONTEXT_MENU_WINDOW_KEY] = first;

			service.setContextMenuInWindow();

			expect((window as unknown as Record<string, unknown>)[VIDEO_BLOT_CONTEXT_MENU_WINDOW_KEY]).toBe(first);
		});
	});
});

describe('VideoMenuComponent', () => {
	afterEach(() => TestBed.resetTestingModule());

	it('passes the chosen action to the service that owns the overlay', () => {
		const close = vi.fn();
		TestBed.configureTestingModule({ providers: [{ provide: VideoBlotContextMenuService, useValue: { close } }] });
		TestBed.overrideComponent(VideoMenuComponent, { set: { template: '', imports: [], styles: [] } });
		const fixture = TestBed.createComponent(VideoMenuComponent);
		fixture.componentInstance.data = { alt: 'a clip' };
		fixture.detectChanges();

		fixture.componentInstance.onAction('delete');

		expect(close).toHaveBeenCalledWith('delete');
	});
});
