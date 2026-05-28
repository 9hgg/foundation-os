import { Dialog } from '@angular/cdk/dialog';
import { inject, Injectable } from '@angular/core';
import {
	FeedbackSelectionModalComponent,
	FeedbackSelectionModalData,
	FeedbackSelectionModalResult,
} from './feedback-selection-modal/feedback-selection-modal.component';

@Injectable({ providedIn: 'root' })
export class FeedbackModals {
	private _dialog = inject(Dialog);

	openFeedbackSelectionDialog(feedbackSelectionModalData: FeedbackSelectionModalData) {
		return this._dialog.open<
			FeedbackSelectionModalResult,
			FeedbackSelectionModalData,
			FeedbackSelectionModalComponent
		>(FeedbackSelectionModalComponent, {
			width: 'auto',
			height: 'auto',
			maxWidth: '1080px',
			maxHeight: '95%',
			panelClass: 'overflow-auto',
			data: feedbackSelectionModalData,
		});
	}
}
