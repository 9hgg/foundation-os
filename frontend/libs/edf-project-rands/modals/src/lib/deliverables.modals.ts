import { Dialog } from '@angular/cdk/dialog';
import { inject, Injectable } from '@angular/core';
import { DeliverableCreateModalComponent, DeliverableCreateModalResult } from './deliverable-create-modal/deliverable-create-modal.component';
import { DeliverableSelectionModalData, DeliverableSelectionModalResult, DeliverablesSelectionModalComponent } from './deliverables-selection-modal/deliverables-selection-modal.component';

@Injectable({ providedIn: 'root' })
export class DeliverablesModals {
	private _dialog = inject(Dialog);

	openDeliverableCreateDialog() {
		const dialogRef = this._dialog.open<DeliverableCreateModalResult, void, DeliverableCreateModalComponent>(DeliverableCreateModalComponent, {
			width: 'auto',
			height: 'auto',
			maxWidth: '600px',
			maxHeight: '95%',
			panelClass: 'overflow-auto',
		});

		dialogRef.closed.subscribe((result) => {
			console.log('Deliverable create dialog closed with', result);
		});

		return dialogRef;
	}

	openDeliverableSelectDialog(deliverableSelectionModalData: DeliverableSelectionModalData) {
		const dialogRef = this._dialog.open<
			DeliverableSelectionModalResult,
			DeliverableSelectionModalData,
			DeliverablesSelectionModalComponent
		>(DeliverablesSelectionModalComponent, {
			width: 'auto',
			height: 'auto',
			maxWidth: '1080px',
			maxHeight: '95%',
			panelClass: 'overflow-auto',
			data: deliverableSelectionModalData,
		});

		dialogRef.closed.subscribe((result) => {
			console.log('Deliverable selection dialog closed with', result);
		});

		return dialogRef;
	}
}
