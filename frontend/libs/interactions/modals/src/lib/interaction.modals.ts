import { Dialog } from '@angular/cdk/dialog';
import { inject, Injectable } from '@angular/core';
import { InteractionSelectionModalData, InteractionSelectionModalResult, InteractionsSelectionModalComponent } from './interactions-selection-modal/interactions-selection-modal.component';

@Injectable({ providedIn: 'root' })
export class InteractionModals {
	isUploading = false;
	nbInteractionsToUpload = 0;
	allProgress: number[] = [];
	_dialog = inject(Dialog);

	///////////////////////////////////////////////
	//         interaction selection             //
	///////////////////////////////////////////////

	/**
	 * Open a dialog to select a interaction
	 * @returns
	 */
	openInteractionsSelectionDialog(interactionSelectionModalData: InteractionSelectionModalData) {
		const dialogRef = this._dialog.open<
			//
			InteractionSelectionModalResult,
			InteractionSelectionModalData,
			InteractionsSelectionModalComponent
		>(InteractionsSelectionModalComponent, {
			width: 'auto',
			height: 'auto',
			data: interactionSelectionModalData,
		});

		dialogRef.closed.subscribe((result) => {
			console.log('The interactions selection dialog was closed with this result:', result);
		});

		return dialogRef;
	}
}
