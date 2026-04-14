import { Dialog } from '@angular/cdk/dialog';
import { inject, Injectable } from '@angular/core';
import { ProjectCreateModalComponent, ProjectCreateModalResult } from './project-create-modal/project-create-modal.component';
import { ProjectSelectionModalData, ProjectSelectionModalResult, ProjectsSelectionModalComponent } from './projects-selection-modal/projects-selection-modal.component';

@Injectable({ providedIn: 'root' })
export class ProjectsModals {
	private _dialog = inject(Dialog);

	openProjectCreateDialog() {
		const dialogRef = this._dialog.open<ProjectCreateModalResult, void, ProjectCreateModalComponent>(ProjectCreateModalComponent, {
			width: 'auto',
			height: 'auto',
			maxWidth: '800px',
			maxHeight: '95%',
			panelClass: 'overflow-auto',
		});

		dialogRef.closed.subscribe((result) => {
			console.log('Project create dialog closed with', result);
		});

		return dialogRef;
	}

	openProjectSelectDialog(projectSelectionModalData: ProjectSelectionModalData) {
		const dialogRef = this._dialog.open<
			//
			ProjectSelectionModalResult,
			ProjectSelectionModalData,
			ProjectsSelectionModalComponent
		>(ProjectsSelectionModalComponent, {
			width: 'auto',
			height: 'auto',
			maxWidth: '1080px',
			maxHeight: '95%',
			panelClass: 'overflow-auto',
			data: projectSelectionModalData,
		});

		dialogRef.closed.subscribe((result) => {
			console.log('Project selection dialog closed with', result);
		});

		return dialogRef;
	}
}
