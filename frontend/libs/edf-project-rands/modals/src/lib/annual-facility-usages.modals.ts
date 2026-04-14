import { Dialog } from '@angular/cdk/dialog';
import { inject, Injectable } from '@angular/core';
import { AnnualFacilityUsageCreateModalComponent, AnnualFacilityUsageCreateModalData, AnnualFacilityUsageCreateModalResult } from './annual-facility-usage-create-modal/annual-facility-usage-create-modal.component';

@Injectable({ providedIn: 'root' })
export class AnnualFacilityUsagesModals {
	private _dialog = inject(Dialog);

	openAnnualFacilityUsageCreateDialog(annualFacilityUsageCreateModalData: AnnualFacilityUsageCreateModalData) {
		const dialogRef = this._dialog.open<
			AnnualFacilityUsageCreateModalResult,
			AnnualFacilityUsageCreateModalData,
			AnnualFacilityUsageCreateModalComponent
		>(AnnualFacilityUsageCreateModalComponent, {
			width: 'auto',
			height: 'auto',
			maxWidth: '600px',
			maxHeight: '95%',
			panelClass: 'overflow-auto',
			data: annualFacilityUsageCreateModalData,
		});

		dialogRef.closed.subscribe((result) => {
			console.log('Annual facility usage create dialog closed with', result);
		});

		return dialogRef;
	}
}
