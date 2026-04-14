import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { Overlay, OverlayRef, OverlayPositionBuilder, FlexibleConnectedPositionStrategy } from '@angular/cdk/overlay';
import { IMAGE_BLOT_CONTEXT_MENU_WINDOW_KEY, ImageBlotContextMenuService } from './image-menu.service';
import { FileModals } from '@foundation/files/modals';

// ---------------------------------------------------------------------------
// Stubs
// ---------------------------------------------------------------------------
const backdropClick$ = { subscribe: vi.fn((cb: any) => ({ unsubscribe: vi.fn() })) };
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
vi.mock('@foundation/files/state', () => ({ convertToUrl: vi.fn(() => 'https://example.com/img.png') }));

describe('ImageBlotContextMenuService', () => {
	let service: ImageBlotContextMenuService;

	beforeEach(() => {
		vi.clearAllMocks();
		TestBed.configureTestingModule({
			providers: [
				ImageBlotContextMenuService,
				{ provide: Overlay, useValue: overlayStub },
				{ provide: FileModals, useValue: fileModalsStub },
			],
		});
		service = TestBed.inject(ImageBlotContextMenuService);
		// Inject the fileModals stub via the private field manually to work around inject()
		(service as any)._fileModals = fileModalsStub;
	});

	afterEach(() => {
		// Clean up window key to avoid leaking between tests
		delete (window as any)[IMAGE_BLOT_CONTEXT_MENU_WINDOW_KEY];
	});

	it('is created', () => {
		expect(service).toBeTruthy();
	});

	it('IMAGE_BLOT_CONTEXT_MENU_WINDOW_KEY is the expected string', () => {
		expect(IMAGE_BLOT_CONTEXT_MENU_WINDOW_KEY).toBe('openImageBlotContextMenu');
	});

	it('setContextMenuInWindow registers a function on window', () => {
		service.setContextMenuInWindow();
		expect(typeof (window as any)[IMAGE_BLOT_CONTEXT_MENU_WINDOW_KEY]).toBe('function');
	});

	it('setContextMenuInWindow does not overwrite an existing registration', () => {
		const existing = vi.fn();
		(window as any)[IMAGE_BLOT_CONTEXT_MENU_WINDOW_KEY] = existing;
		service.setContextMenuInWindow();
		expect((window as any)[IMAGE_BLOT_CONTEXT_MENU_WINDOW_KEY]).toBe(existing);
	});

	it('close with "delete" action calls currentCallback with { action: "delete" }', () => {
		const callback = vi.fn();
		service.currentCallback = callback;
		service.close('delete');
		expect(callback).toHaveBeenCalledWith({ action: 'delete' });
	});

	it('close with "delete" disposes the overlay', () => {
		service.currentCallback = vi.fn();
		// Simulate an open overlay so dispose can be called
		(service as any).overlayRef = overlayRefStub;
		service.close('delete');
		expect(overlayRefStub.dispose).toHaveBeenCalled();
	});

	it('close with unknown action does not call callback', () => {
		const callback = vi.fn();
		service.currentCallback = callback;
		(service as any).overlayRef = overlayRefStub;
		service.close('unknown');
		expect(callback).not.toHaveBeenCalled();
	});

	it('close with "edit" action calls useAnExistingPicture (opens file dialog)', () => {
		const spy = vi.spyOn(service, 'useAnExistingPicture').mockImplementation(() => {});
		service.close('edit');
		expect(spy).toHaveBeenCalled();
	});

	it('currentCallback is null by default', () => {
		expect(service.currentCallback).toBeNull();
	});
});
