import { Dialog } from '@angular/cdk/dialog';
import { inject, Injectable } from '@angular/core';
import { BatchCreateModalComponent, BatchCreateModalResult } from './batch-create-modal/batch-create-modal.component';

@Injectable({ providedIn: 'root' })
export class BatchesModals {
	private _dialog = inject(Dialog);

	openBatchCreateDialog(data?: Partial<BatchCreateModalResult>) {
		const dialogRef = this._dialog.open<BatchCreateModalResult, Partial<BatchCreateModalResult> | void, BatchCreateModalComponent>(BatchCreateModalComponent, {
			width: 'auto',
			height: 'auto',
			maxWidth: '600px',
			maxHeight: '95%',
			panelClass: 'overflow-auto',
			data,
		});

		dialogRef.closed.subscribe((result) => {
			console.log('Batch create dialog closed with', result);
		});

		return dialogRef;
	}
}
