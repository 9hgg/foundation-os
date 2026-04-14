/* eslint-disable @angular-eslint/prefer-inject */
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, effect, Inject, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { Project } from '@edf/edf-project-rands/models';
import { ProjectTableComponent } from '@edf/edf-project-rands/ui';
import { Filter } from '@foundation/network/store';
import { TranslateDirective } from '@foundation/translations/services';
import { dialogCloser$ } from '@foundation/utils';
import { tap } from 'rxjs';

export interface ProjectSelectionConstraints {
	maxProjects?: number;
	minProjects?: number;
	single: boolean;
}

export interface ProjectSelectionModalData {
	selectionConstraints?: ProjectSelectionConstraints;
	filters?: Filter[];
	alreadySelectedProjects?: Project[];
}

export const DEFAULT_PROJECT_SELECTION_MODAL_DATA: Partial<ProjectSelectionModalData> & Required<Pick<ProjectSelectionModalData, 'selectionConstraints'>> = {
	selectionConstraints: {
		maxProjects: 1,
		minProjects: 1,
		single: true,
	},
};

export interface ProjectSelectionModalResult {
	projects: Project[];
}

@Component({
	selector: 'lib-projects-selection-modal',
	standalone: true,
	imports: [FormsModule, TranslateDirective, ProjectTableComponent, RouterModule],
	templateUrl: './projects-selection-modal.component.html',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProjectsSelectionModalComponent {
	projectTableChild = viewChild.required(ProjectTableComponent);

	constructor(
		private _dialogRef: DialogRef<ProjectSelectionModalResult, ProjectsSelectionModalComponent>,
		@Inject(DIALOG_DATA)
		public projectSelectionModalData: ProjectSelectionModalData
	) {
		effect(() => {
			const projectTable = this.projectTableChild();
			projectTable.itemsSelector._min = this.projectSelectionModalData.selectionConstraints?.minProjects ?? projectTable.itemsSelector._min;
			projectTable.itemsSelector._max = this.projectSelectionModalData.selectionConstraints?.maxProjects ?? projectTable.itemsSelector._max;
			projectTable.itemsSelector.selectMultiple(this.projectSelectionModalData.alreadySelectedProjects ?? []);
			projectTable.paginator.setAlwaysOnFilters(this.projectSelectionModalData.filters ?? []);
		});

		dialogCloser$(this._dialogRef)
			.pipe(
				takeUntilDestroyed(),
				tap(() => this.dismiss())
			)
			.subscribe();
	}

	close(result?: ProjectSelectionModalResult) {
		this._dialogRef.close(result);
	}

	dismiss() {
		this._dialogRef.close();
	}

	save() {
		this.close({ projects: this.projectTableChild().itemsSelector.selectedItems });
	}

	cancel() {
		this.dismiss();
	}
}
