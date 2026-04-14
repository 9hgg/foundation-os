import { Dialog } from '@angular/cdk/dialog';
import { inject, Injectable } from '@angular/core';
import { AnnualContributionCreateModalComponent, AnnualContributionCreateModalData, AnnualContributionCreateModalResult } from './annual-contribution-create-modal/annual-contribution-create-modal.component';

@Injectable({ providedIn: 'root' })
export class AnnualContributionsModals {
	private _dialog = inject(Dialog);

	openAnnualContributionCreateDialog(annualContributionCreateModalData: AnnualContributionCreateModalData) {
		const dialogRef = this._dialog.open<
			AnnualContributionCreateModalResult,
			AnnualContributionCreateModalData,
			AnnualContributionCreateModalComponent
		>(AnnualContributionCreateModalComponent, {
			width: 'auto',
			height: 'auto',
			maxWidth: '600px',
			maxHeight: '95%',
			panelClass: 'overflow-auto',
			data: annualContributionCreateModalData,
		});

		dialogRef.closed.subscribe((result) => {
			console.log('Annual contribution create dialog closed with', result);
		});

		return dialogRef;
	}
}
