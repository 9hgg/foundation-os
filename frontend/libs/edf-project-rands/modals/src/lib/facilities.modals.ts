import { Dialog } from '@angular/cdk/dialog';
import { inject, Injectable } from '@angular/core';
import { FacilityCreateModalComponent, FacilityCreateModalResult } from './facility-create-modal/facility-create-modal.component';
import { FacilitySelectionModalData, FacilitySelectionModalResult, FacilitiesSelectionModalComponent } from './facilities-selection-modal/facilities-selection-modal.component';

@Injectable({ providedIn: 'root' })
export class FacilitiesModals {
	private _dialog = inject(Dialog);

	openFacilityCreateDialog() {
		const dialogRef = this._dialog.open<FacilityCreateModalResult, void, FacilityCreateModalComponent>(FacilityCreateModalComponent, {
			width: 'auto',
			height: 'auto',
			maxWidth: '600px',
			maxHeight: '95%',
			panelClass: 'overflow-auto',
		});

		dialogRef.closed.subscribe((result) => {
			console.log('Facility create dialog closed with', result);
		});

		return dialogRef;
	}

	openFacilitySelectDialog(facilitySelectionModalData: FacilitySelectionModalData) {
		const dialogRef = this._dialog.open<
			FacilitySelectionModalResult,
			FacilitySelectionModalData,
			FacilitiesSelectionModalComponent
		>(FacilitiesSelectionModalComponent, {
			width: 'auto',
			height: 'auto',
			maxWidth: '1080px',
			maxHeight: '95%',
			panelClass: 'overflow-auto',
			data: facilitySelectionModalData,
		});

		dialogRef.closed.subscribe((result) => {
			console.log('Facility selection dialog closed with', result);
		});

		return dialogRef;
	}
}
