import { Dialog } from '@angular/cdk/dialog';
import { inject, Injectable } from '@angular/core';
import { User } from '@foundation/users/models';
import { SmartRestStore } from '@foundation/network/store';
import { UserSelectionModalData, UserSelectionModalResult, UsersSelectionModalComponent } from './users-selection-modal/users-selection-modal.component';

@Injectable({ providedIn: 'root' })
export class UserModals {
	userStore: SmartRestStore<User> = new SmartRestStore<User>('/api/users', 'user');
	private _dialog = inject(Dialog);

	///////////////////////////////////////////////
	//         user selection                    //
	///////////////////////////////////////////////

	/**
	 * Open a dialog to select a user
	 * @returns
	 */
	openUsersSelectionDialog(userSelectionModalData: UserSelectionModalData) {
		const dialogRef = this._dialog.open<
			//
			UserSelectionModalResult,
			UserSelectionModalData,
			UsersSelectionModalComponent
		>(UsersSelectionModalComponent, {
			width: 'auto',
			height: 'auto',
			maxWidth: '600px',
			maxHeight: '95%',
			panelClass: 'overflow-auto',
			// container'
			data: userSelectionModalData,
		});

		dialogRef.closed.subscribe((result) => {
			console.log('The users selection dialog was closed with this result:', result);
		});

		return dialogRef;
	}
}
