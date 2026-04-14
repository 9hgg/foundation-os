import { Dialog } from '@angular/cdk/dialog';
import { inject, Injectable } from '@angular/core';
import { ActivityCreateModalComponent, ActivityCreateModalData, ActivityCreateModalResult } from './activity-create-modal/activity-create-modal.component';

@Injectable({ providedIn: 'root' })
export class ActivitiesModals {
	private _dialog = inject(Dialog);

	openActivityCreateDialog(activityCreateModalData?: ActivityCreateModalData) {
		const dialogRef = this._dialog.open<ActivityCreateModalResult, ActivityCreateModalData, ActivityCreateModalComponent>(ActivityCreateModalComponent, {
			width: 'auto',
			height: 'auto',
			maxWidth: '600px',
			maxHeight: '95%',
			panelClass: 'overflow-auto',
			data: activityCreateModalData,
		});

		dialogRef.closed.subscribe((result) => {
			console.log('Activity create dialog closed with', result);
		});

		return dialogRef;
	}
}
