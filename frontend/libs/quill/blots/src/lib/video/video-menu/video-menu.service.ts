import { FileModals } from '@foundation/files/modals';
import { convertToUrl } from '@foundation/files/state';
import { Overlay, OverlayRef } from '@angular/cdk/overlay';
import { ComponentPortal } from '@angular/cdk/portal';
import { inject, Injectable } from '@angular/core';
import { CallbackFunction } from '../../blots.utils';
import { VideoMenuComponent } from './video-menu.component';

export const VIDEO_BLOT_CONTEXT_MENU_WINDOW_KEY = 'openVideoBlotContextMenu';

@Injectable({ providedIn: 'root' })
export class VideoBlotContextMenuService {
	private overlayRef: OverlayRef | null = null;
	private _fileModals = inject(FileModals);

	constructor(private overlay: Overlay) {}

	currentCallback: CallbackFunction | null = null;

	open(event: MouseEvent, data?: any, callback: CallbackFunction | null = null) {
		// Dispose any existing overlay.
		this._disposeOverlay();

		this.currentCallback = callback;

		// Position the overlay at the click coordinates.
		const positionStrategy = this.overlay
			.position()
			.flexibleConnectedTo({ x: event.clientX, y: event.clientY })
			.withPositions([
				{
					originX: 'start',
					originY: 'top',
					overlayX: 'start',
					overlayY: 'top',
				},
			]);

		this.overlayRef = this.overlay.create({ positionStrategy, hasBackdrop: true, backdropClass: 'transparent-backdrop' });

		// Create and attach the menu component portal.
		const portal = new ComponentPortal(VideoMenuComponent);
		const componentRef = this.overlayRef.attach(portal);
		componentRef.instance.data = data;

		// Close the overlay when the user clicks outside.
		this.overlayRef.backdropClick().subscribe(() => this.close());
	}

	close(action?: string) {
		switch (action) {
			case 'edit':
				this.useAnExistingPicture();
				return;
			case 'delete':
				this.currentCallback?.({ action: 'delete' });
				break;
			default:
				console.warn(`[ContextMenu] Unknown action: ${action}`);
				break;
		}

		this._disposeOverlay();
	}

	private _disposeOverlay() {
		if (this.overlayRef) {
			this.overlayRef.dispose();
			this.overlayRef = null;
		}
	}

	setContextMenuInWindow() {
		// Check if the window is already defined.
		if (typeof window === 'undefined') {
			console.error('Window is not defined. Cannot set context menu.');
			return;
		}
		// Check if the context menu is already set.
		if ((window as any)[VIDEO_BLOT_CONTEXT_MENU_WINDOW_KEY]) {
			return;
		}

		// Expose a global function to open the Angular context menu.
		(window as any)[VIDEO_BLOT_CONTEXT_MENU_WINDOW_KEY] = (event: MouseEvent, data?: any, callback: CallbackFunction | null = null) => {
			this.open(event, data, callback);
		};
	}

	public useAnExistingPicture() {
		this._fileModals
			.openFilesSelectionDialog({
				selectionConstraints: {
					single: true,
					maxFiles: 1,
					minFiles: 1,
				},
				filters: [{ fieldName: 'kind', value: 'video' }],
			})
			.closed.subscribe((result) => {
				console.log('The files selection dialog was closed with this result:', result);
				if (result?.files?.length) {
					const fileToUse = result.files[0];
					this.currentCallback?.({
						action: 'edit',
						newUrl: convertToUrl(fileToUse),
					});
					this.close();
				}
			});
	}
}
