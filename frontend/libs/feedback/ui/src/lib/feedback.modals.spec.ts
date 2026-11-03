import { Dialog } from '@angular/cdk/dialog';
import { TestBed } from '@angular/core/testing';
import { FeedbackSelectionModalComponent } from './feedback-selection-modal/feedback-selection-modal.component';
import { FeedbackModals } from './feedback.modals';

describe('FeedbackModals', () => {
	it('opens the selection dialog with the expected configuration', () => {
		const open = vi.fn().mockReturnValue({});
		TestBed.configureTestingModule({ providers: [FeedbackModals, { provide: Dialog, useValue: { open } }] });
		const service = TestBed.inject(FeedbackModals);
		const data = { items: [], selectedSlugs: ['billing'] };

		service.openFeedbackSelectionDialog(data);

		expect(open).toHaveBeenCalledWith(FeedbackSelectionModalComponent, {
			width: 'auto',
			height: 'auto',
			maxWidth: '1080px',
			maxHeight: '95%',
			panelClass: 'overflow-auto',
			data,
		});
	});
});
