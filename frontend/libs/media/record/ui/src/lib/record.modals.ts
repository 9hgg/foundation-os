import { Dialog } from '@angular/cdk/dialog';
import { inject, Injectable } from '@angular/core';
import { RecordingModalComponent, RecordingModalData, RecordingModalResult } from './recording-modal/recording-modal.component';

@Injectable({ providedIn: 'root' })
export class RecordModals {
	private _dialog = inject(Dialog);

	openRecordingDialog(data: RecordingModalData) {
		return this._dialog.open<RecordingModalResult, RecordingModalData, RecordingModalComponent>(RecordingModalComponent, {
			width: '92vw',
			height: 'auto',
			maxWidth: '768px',
			maxHeight: '95%',
			panelClass: 'overflow-auto',
			disableClose: true,
			data,
		});
	}
}
