import { Dialog } from '@angular/cdk/dialog';
import { inject, Injectable } from '@angular/core';
import { TeamSelectionModalData, TeamSelectionModalResult, TeamsSelectionModalComponent } from './teams-selection-modal/teams-selection-modal.component';

@Injectable({ providedIn: 'root' })
export class TeamsModals {
	private _dialog = inject(Dialog);

	///////////////////////////////////////////////
	//         team selection                    //
	///////////////////////////////////////////////

	/**
	 * Open a dialog to select a team
	 * @returns
	 */
	openTeamsSelectionDialog(teamSelectionModalData: TeamSelectionModalData) {
		const dialogRef = this._dialog.open<
			//
			TeamSelectionModalResult,
			TeamSelectionModalData,
			TeamsSelectionModalComponent
		>(TeamsSelectionModalComponent, {
			width: 'auto',
			height: 'auto',
			maxWidth: '1080px',
			maxHeight: '95%',
			panelClass: 'overflow-auto',
			// container'
			data: teamSelectionModalData,
		});

		dialogRef.closed.subscribe((result) => {
			console.log('The teams selection dialog was closed with this result:', result);
		});

		return dialogRef;
	}
}
