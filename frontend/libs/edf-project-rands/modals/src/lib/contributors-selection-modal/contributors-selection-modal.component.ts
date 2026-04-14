/* eslint-disable @angular-eslint/prefer-inject */
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, effect, Inject, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { Contributor } from '@edf/edf-project-rands/models';
import { ContributorTableComponent } from '@edf/edf-project-rands/ui';
import { Filter } from '@foundation/network/store';
import { TranslateDirective } from '@foundation/translations/services';
import { dialogCloser$ } from '@foundation/utils';
import { tap } from 'rxjs';

export interface ContributorSelectionConstraints {
	maxContributors?: number;
	minContributors?: number;
	single: boolean;
}

export interface ContributorSelectionModalData {
	selectionConstraints?: ContributorSelectionConstraints;
	filters?: Filter[];
	alreadySelectedContributors?: Contributor[];
}

export const DEFAULT_CONTRIBUTOR_SELECTION_MODAL_DATA: Partial<ContributorSelectionModalData> & Required<Pick<ContributorSelectionModalData, 'selectionConstraints'>> = {
	selectionConstraints: {
		maxContributors: 1,
		minContributors: 1,
		single: true,
	},
};

export interface ContributorSelectionModalResult {
	contributors: Contributor[];
}

@Component({
	selector: 'lib-contributors-selection-modal',
	standalone: true,
	imports: [FormsModule, TranslateDirective, ContributorTableComponent, RouterModule],
	templateUrl: './contributors-selection-modal.component.html',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ContributorsSelectionModalComponent {
	contributorTableChild = viewChild.required(ContributorTableComponent);

	constructor(
		private _dialogRef: DialogRef<ContributorSelectionModalResult, ContributorsSelectionModalComponent>,
		@Inject(DIALOG_DATA)
		public contributorSelectionModalData: ContributorSelectionModalData
	) {
		effect(() => {
			const contributorTable = this.contributorTableChild();
			contributorTable.itemsSelector._min = this.contributorSelectionModalData.selectionConstraints?.minContributors ?? contributorTable.itemsSelector._min;
			contributorTable.itemsSelector._max = this.contributorSelectionModalData.selectionConstraints?.maxContributors ?? contributorTable.itemsSelector._max;
			contributorTable.itemsSelector.selectMultiple(this.contributorSelectionModalData.alreadySelectedContributors ?? []);
			contributorTable.paginator.setAlwaysOnFilters(this.contributorSelectionModalData.filters ?? []);
		});

		dialogCloser$(this._dialogRef)
			.pipe(
				takeUntilDestroyed(),
				tap(() => this.dismiss())
			)
			.subscribe();
	}

	close(result?: ContributorSelectionModalResult) {
		this._dialogRef.close(result);
	}

	dismiss() {
		this._dialogRef.close();
	}

	save() {
		this.close({ contributors: this.contributorTableChild().itemsSelector.selectedItems });
	}

	cancel() {
		this.dismiss();
	}
}
