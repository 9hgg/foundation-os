/* eslint-disable @angular-eslint/prefer-inject */
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, effect, Inject, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { Facility } from '@edf/edf-project-rands/models';
import { FacilityTableComponent } from '@edf/edf-project-rands/ui';
import { Filter } from '@foundation/network/store';
import { TranslateDirective } from '@foundation/translations/services';
import { dialogCloser$ } from '@foundation/utils';
import { tap } from 'rxjs';

export interface FacilitySelectionConstraints {
	maxFacilities?: number;
	minFacilities?: number;
	single: boolean;
}

export interface FacilitySelectionModalData {
	selectionConstraints?: FacilitySelectionConstraints;
	filters?: Filter[];
	alreadySelectedFacilities?: Facility[];
}

export const DEFAULT_FACILITY_SELECTION_MODAL_DATA: Partial<FacilitySelectionModalData> & Required<Pick<FacilitySelectionModalData, 'selectionConstraints'>> = {
	selectionConstraints: {
		maxFacilities: 1,
		minFacilities: 1,
		single: true,
	},
};

export interface FacilitySelectionModalResult {
	facilities: Facility[];
}

@Component({
	selector: 'lib-facilities-selection-modal',
	standalone: true,
	imports: [FormsModule, TranslateDirective, FacilityTableComponent, RouterModule],
	templateUrl: './facilities-selection-modal.component.html',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FacilitiesSelectionModalComponent {
	facilityTableChild = viewChild.required(FacilityTableComponent);

	constructor(
		private _dialogRef: DialogRef<FacilitySelectionModalResult, FacilitiesSelectionModalComponent>,
		@Inject(DIALOG_DATA)
		public facilitySelectionModalData: FacilitySelectionModalData
	) {
		effect(() => {
			const facilityTable = this.facilityTableChild();
			facilityTable.itemsSelector._min = this.facilitySelectionModalData.selectionConstraints?.minFacilities ?? facilityTable.itemsSelector._min;
			facilityTable.itemsSelector._max = this.facilitySelectionModalData.selectionConstraints?.maxFacilities ?? facilityTable.itemsSelector._max;
			facilityTable.itemsSelector.selectMultiple(this.facilitySelectionModalData.alreadySelectedFacilities ?? []);
			facilityTable.paginator.setAlwaysOnFilters(this.facilitySelectionModalData.filters ?? []);
		});

		dialogCloser$(this._dialogRef)
			.pipe(
				takeUntilDestroyed(),
				tap(() => this.dismiss())
			)
			.subscribe();
	}

	close(result?: FacilitySelectionModalResult) {
		this._dialogRef.close(result);
	}

	dismiss() {
		this._dialogRef.close();
	}

	save() {
		this.close({ facilities: this.facilityTableChild().itemsSelector.selectedItems });
	}

	cancel() {
		this.dismiss();
	}
}
