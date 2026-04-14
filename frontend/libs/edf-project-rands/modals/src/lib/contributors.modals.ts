import { Dialog } from '@angular/cdk/dialog';
import { inject, Injectable } from '@angular/core';
import { ContributorPreviewRow } from '@edf/edf-project-rands/models';
import { ContributorCreateModalComponent, ContributorCreateModalResult } from './contributor-create-modal/contributor-create-modal.component';
import { ContributorsImportPreviewModalComponent, ContributorsImportPreviewResult } from './contributors-import-preview-modal/contributors-import-preview-modal.component';
import { ContributorSelectionModalData, ContributorSelectionModalResult, ContributorsSelectionModalComponent } from './contributors-selection-modal/contributors-selection-modal.component';

@Injectable({ providedIn: 'root' })
export class ContributorsModals {
	private _dialog = inject(Dialog);

	openContributorCreateDialog() {
		const dialogRef = this._dialog.open<ContributorCreateModalResult, void, ContributorCreateModalComponent>(ContributorCreateModalComponent, {
			width: 'auto',
			height: 'auto',
			maxWidth: '600px',
			maxHeight: '95%',
			panelClass: 'overflow-auto',
		});

		dialogRef.closed.subscribe((result) => {
			console.log('Contributor create dialog closed with', result);
		});

		return dialogRef;
	}

	openContributorSelectDialog(contributorSelectionModalData: ContributorSelectionModalData) {
		const dialogRef = this._dialog.open<ContributorSelectionModalResult, ContributorSelectionModalData, ContributorsSelectionModalComponent>(ContributorsSelectionModalComponent, {
			width: 'auto',
			height: 'auto',
			maxWidth: '800px',
			maxHeight: '95%',
			panelClass: 'overflow-auto',
			data: contributorSelectionModalData,
		});
		return dialogRef;
	}

	openImportPreviewDialog(previewRows: ContributorPreviewRow[]) {
		const dialogRef = this._dialog.open<ContributorsImportPreviewResult, ContributorPreviewRow[], ContributorsImportPreviewModalComponent>(ContributorsImportPreviewModalComponent, {
			width: 'auto',
			height: 'auto',
			maxWidth: '1080px',
			maxHeight: '95%',
			panelClass: 'overflow-auto',
			data: previewRows,
		});

		dialogRef.closed.subscribe((result) => {
			console.log('Import preview dialog closed with', result);
		});

		return dialogRef;
	}
}
