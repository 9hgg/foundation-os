import { Dialog } from '@angular/cdk/dialog';
import { inject, Injectable } from '@angular/core';
import { EntityFile } from '@foundation/files/models';
import { FileDisplayModalComponent, FileDisplayModalData } from './file-display-modal/file-display-modal.component';
import { FileSelectionModalData, FileSelectionModalResult, FilesSelectionModalComponent } from './files-selection-modal/files-selection-modal.component';

@Injectable({ providedIn: 'root' })
export class FileModals {
	private _dialog = inject(Dialog);

	///////////////////////////////////////////////
	//         file selection                    //
	///////////////////////////////////////////////

	/**
	 * Open a dialog to select a file
	 * @returns
	 */
	openFilesSelectionDialog(fileSelectionModalData: FileSelectionModalData) {
		const dialogRef = this._dialog.open<
			//
			FileSelectionModalResult,
			FileSelectionModalData,
			FilesSelectionModalComponent
		>(FilesSelectionModalComponent, {
			width: 'auto',
			height: 'auto',
			maxWidth: '1080px',
			maxHeight: '95%',
			panelClass: 'overflow-auto',
			// container'
			data: fileSelectionModalData,
		});

		dialogRef.closed.subscribe((result) => {
			console.log('The files selection dialog was closed with this result:', result);
		});

		return dialogRef;
	}

	///////////////////////////////////////////////
	//         file display                      //
	///////////////////////////////////////////////

	openFileDisplayDialog(fileDisplayModalData: FileDisplayModalData) {
		return this._dialog.open<void, FileDisplayModalData, FileDisplayModalComponent>(FileDisplayModalComponent, {
			width: '100%',
			height: 'auto',
			maxWidth: '95%',
			maxHeight: '95%',
			panelClass: 'overflow-auto',
			data: fileDisplayModalData,
		});
	}

	openEntityFileDisplayDialog(entityFile: EntityFile) {
		return this.openFileDisplayDialog({ entityFile });
	}
}
