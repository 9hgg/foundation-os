import { Dialog } from '@angular/cdk/dialog';
import { inject, Injectable } from '@angular/core';
import { CustomerCreateModalComponent, CustomerCreateModalResult } from './customer-create-modal/customer-create-modal.component';
import { CustomerSelectionModalData, CustomerSelectionModalResult, CustomersSelectionModalComponent } from './customers-selection-modal/customers-selection-modal.component';

@Injectable({ providedIn: 'root' })
export class CustomersModals {
	private _dialog = inject(Dialog);

	openCustomerCreateDialog() {
		const dialogRef = this._dialog.open<CustomerCreateModalResult, void, CustomerCreateModalComponent>(CustomerCreateModalComponent, {
			width: 'auto',
			height: 'auto',
			maxWidth: '600px',
			maxHeight: '95%',
			panelClass: 'overflow-auto',
		});

		dialogRef.closed.subscribe((result) => {
			// debug
			console.log('Customer create dialog closed with', result);
		});

		return dialogRef;
	}

	openCustomerSelectDialog(customerSelectionModalData: CustomerSelectionModalData) {
		const dialogRef = this._dialog.open<CustomerSelectionModalResult, CustomerSelectionModalData, CustomersSelectionModalComponent>(CustomersSelectionModalComponent, {
			width: 'auto',
			height: 'auto',
			maxWidth: '800px',
			maxHeight: '95%',
			panelClass: 'overflow-auto',
			data: customerSelectionModalData,
		});
		return dialogRef;
	}
}
