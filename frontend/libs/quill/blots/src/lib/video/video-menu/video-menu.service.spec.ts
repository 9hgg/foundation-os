import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { Overlay, OverlayRef, FlexibleConnectedPositionStrategy } from '@angular/cdk/overlay';
import { VIDEO_BLOT_CONTEXT_MENU_WINDOW_KEY, VideoBlotContextMenuService } from './video-menu.service';
import { FileModals } from '@foundation/files/modals';

// ---------------------------------------------------------------------------
// Stubs
// ---------------------------------------------------------------------------
const backdropClick$ = { subscribe: vi.fn(() => ({ unsubscribe: vi.fn() })) };
const overlayRefStub: Partial<OverlayRef> = {
	attach: vi.fn().mockReturnValue({ instance: { data: null } }),
	dispose: vi.fn(),
	backdropClick: vi.fn().mockReturnValue(backdropClick$),
};

const positionStrategyStub: Partial<FlexibleConnectedPositionStrategy> = {
	withPositions: vi.fn().mockReturnThis(),
};
const positionBuilderStub = {
	flexibleConnectedTo: vi.fn().mockReturnValue(positionStrategyStub),
};
const overlayStub: Partial<Overlay> = {
	position: vi.fn().mockReturnValue(positionBuilderStub),
	create: vi.fn().mockReturnValue(overlayRefStub),
};

const fileModalsStub = {
	openFilesSelectionDialog: vi.fn().mockReturnValue({
		closed: { subscribe: vi.fn() },
	}),
};

vi.mock('@foundation/files/modals', () => ({ FileModals: class {} }));
vi.mock('@foundation/files/state', () => ({ convertToUrl: vi.fn(() => 'https://example.com/video.mp4') }));

describe('VideoBlotContextMenuService', () => {
	let service: VideoBlotContextMenuService;

	beforeEach(() => {
		vi.clearAllMocks();
		TestBed.configureTestingModule({
			providers: [
				VideoBlotContextMenuService,
				{ provide: Overlay, useValue: overlayStub },
				{ provide: FileModals, useValue: fileModalsStub },
			],
		});
		service = TestBed.inject(VideoBlotContextMenuService);
		(service as any)._fileModals = fileModalsStub;
	});

	afterEach(() => {
		delete (window as any)[VIDEO_BLOT_CONTEXT_MENU_WINDOW_KEY];
	});

	it('is created', () => {
		expect(service).toBeTruthy();
	});

	it('VIDEO_BLOT_CONTEXT_MENU_WINDOW_KEY is the expected string', () => {
		expect(VIDEO_BLOT_CONTEXT_MENU_WINDOW_KEY).toBe('openVideoBlotContextMenu');
	});

	it('setContextMenuInWindow registers a function on window', () => {
		service.setContextMenuInWindow();
		expect(typeof (window as any)[VIDEO_BLOT_CONTEXT_MENU_WINDOW_KEY]).toBe('function');
	});

	it('setContextMenuInWindow does not overwrite an existing registration', () => {
		const existing = vi.fn();
		(window as any)[VIDEO_BLOT_CONTEXT_MENU_WINDOW_KEY] = existing;
		service.setContextMenuInWindow();
		expect((window as any)[VIDEO_BLOT_CONTEXT_MENU_WINDOW_KEY]).toBe(existing);
	});

	it('close with "delete" action calls currentCallback with { action: "delete" }', () => {
		const callback = vi.fn();
		service.currentCallback = callback;
		service.close('delete');
		expect(callback).toHaveBeenCalledWith({ action: 'delete' });
	});

	it('close with "delete" disposes the overlay', () => {
		service.currentCallback = vi.fn();
		(service as any).overlayRef = overlayRefStub;
		service.close('delete');
		expect(overlayRefStub.dispose).toHaveBeenCalled();
	});

	it('close with unknown action does not call callback', () => {
		const callback = vi.fn();
		service.currentCallback = callback;
		(service as any).overlayRef = overlayRefStub;
		service.close('unknown-action');
		expect(callback).not.toHaveBeenCalled();
	});

	it('close with "edit" action calls useAnExistingPicture', () => {
		const spy = vi.spyOn(service, 'useAnExistingPicture').mockImplementation(() => {});
		service.close('edit');
		expect(spy).toHaveBeenCalled();
	});

	it('currentCallback is null by default', () => {
		expect(service.currentCallback).toBeNull();
	});
});
