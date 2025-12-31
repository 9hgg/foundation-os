import { Team } from '@foundation/teams/models';
import { TeamsRepository } from '@foundation/teams/state';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, effect, Inject, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { TeamTableComponent } from '@foundation/teams/ui';
import { TranslationsRepository } from '@foundation/translations/state';
import { TranslationService } from '@foundation/translations/services';
import { TranslationTableComponent } from '@foundation/translations/ui';
import { TranslatePipe, TranslateDirective } from '@foundation/translations/services';
import { Filter } from '@foundation/network/store';
import { dialogCloser$ } from '@foundation/utils';
import { tap } from 'rxjs';

export interface TeamSelectionConstraints {
	maxTeams?: number;
	minTeams?: number;
	single: boolean;
}

export interface TeamSelectionModalData {
	selectionConstraints?: TeamSelectionConstraints;
	filters?: Filter[];
}

export const DEFAULT_FILE_SELECTION_MODAL_DATA: Partial<TeamSelectionModalData> & Required<Pick<TeamSelectionModalData, 'selectionConstraints'>> = {
	selectionConstraints: {
		maxTeams: 1,
		minTeams: 1,
		single: true,
	},
};

export interface TeamSelectionModalResult {
	teams: Team[];
}

@Component({
	selector: 'lib-teams-selection-modal',
	standalone: true,
	imports: [FormsModule, TranslateDirective, TeamTableComponent],
	templateUrl: './teams-selection-modal.component.html',
	changeDetection: ChangeDetectionStrategy.OnPush,
	styleUrls: ['./teams-selection-modal.component.css'],
})
export class TeamsSelectionModalComponent {
	// paginatedTeams: PaginatorState<Team>;

	// selectedTeams: Selector<Team>;

	fileTableChild = viewChild.required(TeamTableComponent);

	constructor(
		private _dialogRef: DialogRef<TeamSelectionModalResult, TeamsSelectionModalComponent>,
		@Inject(DIALOG_DATA)
		public fileSelectionModalData: TeamSelectionModalData,
		private _filesRepository: TeamsRepository
	) {
		// following modal parameters to the file table
		effect(() => {
			const fileTable = this.fileTableChild();
			fileTable.itemsSelector._min = this.fileSelectionModalData.selectionConstraints?.minTeams ?? fileTable.itemsSelector._min;
			fileTable.itemsSelector._max = this.fileSelectionModalData.selectionConstraints?.maxTeams ?? fileTable.itemsSelector._max;
			fileTable.paginator.setAlwaysOnFilters(this.fileSelectionModalData.filters ?? []);
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

	close(result: TeamSelectionModalResult | undefined) {
		this._dialogRef.close(result);
	}

	dismiss() {
		this._dialogRef.close();
	}

	save() {
		this.close({
			teams: this.fileTableChild().itemsSelector.selectedItems,
		});
	}

	cancel() {
		this.dismiss();
	}
}
