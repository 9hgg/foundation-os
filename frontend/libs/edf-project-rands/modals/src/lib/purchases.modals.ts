import { Dialog } from '@angular/cdk/dialog';
import { inject, Injectable } from '@angular/core';
import { PurchaseCreateModalComponent, PurchaseCreateModalData, PurchaseCreateModalResult } from './purchase-create-modal/purchase-create-modal.component';

@Injectable({ providedIn: 'root' })
export class PurchasesModals {
	private _dialog = inject(Dialog);

	openPurchaseCreateDialog(purchaseCreateModalData?: PurchaseCreateModalData) {
		const dialogRef = this._dialog.open<PurchaseCreateModalResult, PurchaseCreateModalData | undefined, PurchaseCreateModalComponent>(PurchaseCreateModalComponent, {
			width: 'auto',
			height: 'auto',
			maxWidth: '600px',
			maxHeight: '95%',
			panelClass: 'overflow-auto',
			data: purchaseCreateModalData,
		});

		dialogRef.closed.subscribe((result) => {
			console.log('Purchase create dialog closed with', result);
		});

		return dialogRef;
	}
}
