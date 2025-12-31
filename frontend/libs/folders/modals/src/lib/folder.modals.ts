import { Dialog } from '@angular/cdk/dialog';
import { inject, Injectable } from '@angular/core';
import { FoldersSelectionModalComponent, FoldersSelectionModalData, FoldersSelectionModalResult } from './folders-selection-modal/folders-selection-modal.component';

@Injectable({ providedIn: 'root' })
export class FoldersModals {
	private _dialog = inject(Dialog);

	///////////////////////////////////////////////
	//         folder selection                    //
	///////////////////////////////////////////////

	/**
	 * Open a dialog to select a folder
	 * @returns
	 */
	openFolderSelectionDialog(
		folderSelectionModalData: FoldersSelectionModalData = {
			selectionConstraints: {
				single: true,
				maxFolders: 1,
				minFolders: 1,
			},
		}
	) {
		const dialogRef = this._dialog.open<
			//
			FoldersSelectionModalResult,
			FoldersSelectionModalData,
			FoldersSelectionModalComponent
		>(FoldersSelectionModalComponent, {
			width: 'auto',
			height: 'auto',
			maxWidth: '1080px',
			maxHeight: '95%',
			panelClass: 'overflow-auto',
			// container'
			data: folderSelectionModalData,
		});

		dialogRef.closed.subscribe((result) => {
			console.log('The folders selection dialog was closed with this result:', result);
		});

		return dialogRef;
	}
}
