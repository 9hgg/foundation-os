import { Dialog } from '@angular/cdk/dialog';
import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { InteractionModals } from './interaction.modals';
import { InteractionsSelectionModalComponent } from './interactions-selection-modal/interactions-selection-modal.component';

describe('InteractionModals', () => {
	const open = vi.fn(() => ({ closed: of({ interactions: [] }) }));
	let modals: InteractionModals;

	beforeEach(() => {
		open.mockClear();
		TestBed.configureTestingModule({ providers: [InteractionModals, { provide: Dialog, useValue: { open } }] });
		modals = TestBed.inject(InteractionModals);
	});

	afterEach(() => TestBed.resetTestingModule());

	it('starts with no upload in flight', () => {
		expect(modals.isUploading).toBe(false);
		expect(modals.nbInteractionsToUpload).toBe(0);
		expect(modals.allProgress).toEqual([]);
	});

	it('opens the selection modal with the caller data', () => {
		const data = { interactions: [], selectionConstraints: { single: true } };

		modals.openInteractionsSelectionDialog(data);

		expect(open).toHaveBeenCalledWith(InteractionsSelectionModalComponent, expect.objectContaining({ data }));
	});

	it('lets the dialog size itself to its content', () => {
		modals.openInteractionsSelectionDialog({ interactions: [] });

		expect(open.mock.calls[0][1]).toMatchObject({ width: 'auto', height: 'auto' });
	});

	it('hands the dialog reference back so the caller can await the selection', () => {
		const dialogRef = modals.openInteractionsSelectionDialog({ interactions: [] });

		let result: unknown;
		dialogRef.closed.subscribe((value) => (result = value));
		expect(result).toEqual({ interactions: [] });
	});
});
