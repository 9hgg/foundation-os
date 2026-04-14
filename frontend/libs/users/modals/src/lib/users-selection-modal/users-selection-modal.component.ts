/* eslint-disable @angular-eslint/prefer-inject */
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, effect, inject, Inject, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { Filter } from '@foundation/network/store';
import { TranslateDirective } from '@foundation/translations/services';
import { User } from '@foundation/users/models';
import { UsersRepository } from '@foundation/users/state';
import { UserTableComponent } from '@foundation/users/ui';
import { BehaviorSubjectReplayedFromObs, dialogCloser$ } from '@foundation/utils';
import { from, tap } from 'rxjs';

export interface UserSelectionConstraints {
	maxUsers?: number;
	minUsers?: number;
	single: boolean;
}

export interface UserSelectionModalData {
	selectionConstraints?: UserSelectionConstraints;
	filters?: Filter[];
	alreadySelectedUsers?: User[];
}

export const DEFAULT_FILE_SELECTION_MODAL_DATA: Partial<UserSelectionModalData> & Required<Pick<UserSelectionModalData, 'selectionConstraints'>> = {
	selectionConstraints: {
		maxUsers: 1,
		minUsers: 1,
		single: true,
	},
};

export interface UserSelectionModalResult {
	users: User[];
}

@Component({
	selector: 'lib-users-selection-modal',
	standalone: true,
	imports: [FormsModule, TranslateDirective, UserTableComponent, RouterModule],
	templateUrl: './users-selection-modal.component.html',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UsersSelectionModalComponent {
	public usersRepository = inject(UsersRepository);
	userTableChild = viewChild.required(UserTableComponent);
	selectedUsers$$$ = BehaviorSubjectReplayedFromObs<User[]>([], from([]));

	constructor(
		private _dialogRef: DialogRef<UserSelectionModalResult, UsersSelectionModalComponent>,
		@Inject(DIALOG_DATA)
		public userSelectionModalData: UserSelectionModalData
	) {
		// forwarding modal parameters to the user table
		effect(() => {
			const userTable = this.userTableChild();
			userTable.itemsSelector.selectMultiple(userSelectionModalData.alreadySelectedUsers ?? []);
			this.selectedUsers$$$.setSource(userTable.itemsSelector.selectedItems$);
		});

		dialogCloser$(this._dialogRef)
			.pipe(
				takeUntilDestroyed(),
				tap((e) => {
					this.dismiss();
				})
			)
			.subscribe();
	}

	close(result?: UserSelectionModalResult) {
		this._dialogRef.close(result);
	}

	dismiss() {
		this._dialogRef.close();
	}

	save() {
		this.close({ users: this.userTableChild().itemsSelector.selectedItems });
	}

	cancel() {
		this.dismiss();
	}
}
