/* eslint-disable @angular-eslint/prefer-inject */
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, effect, Inject, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { Deliverable } from '@edf/edf-project-rands/models';
import { DeliverableTableComponent } from '@edf/edf-project-rands/ui';
import { Filter } from '@foundation/network/store';
import { TranslateDirective } from '@foundation/translations/services';
import { dialogCloser$ } from '@foundation/utils';
import { tap } from 'rxjs';

export interface DeliverableSelectionConstraints {
	maxDeliverables?: number;
	minDeliverables?: number;
	single: boolean;
}

export interface DeliverableSelectionModalData {
	selectionConstraints?: DeliverableSelectionConstraints;
	filters?: Filter[];
	alreadySelectedDeliverables?: Deliverable[];
}

export const DEFAULT_DELIVERABLE_SELECTION_MODAL_DATA: Partial<DeliverableSelectionModalData> & Required<Pick<DeliverableSelectionModalData, 'selectionConstraints'>> = {
	selectionConstraints: {
		maxDeliverables: 1,
		minDeliverables: 1,
		single: true,
	},
};

export interface DeliverableSelectionModalResult {
	deliverables: Deliverable[];
}

@Component({
	selector: 'lib-deliverables-selection-modal',
	standalone: true,
	imports: [FormsModule, TranslateDirective, DeliverableTableComponent, RouterModule],
	templateUrl: './deliverables-selection-modal.component.html',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DeliverablesSelectionModalComponent {
	deliverableTableChild = viewChild.required(DeliverableTableComponent);

	constructor(
		private _dialogRef: DialogRef<DeliverableSelectionModalResult, DeliverablesSelectionModalComponent>,
		@Inject(DIALOG_DATA)
		public deliverableSelectionModalData: DeliverableSelectionModalData
	) {
		effect(() => {
			const deliverableTable = this.deliverableTableChild();
			deliverableTable.itemsSelector._min = this.deliverableSelectionModalData.selectionConstraints?.minDeliverables ?? deliverableTable.itemsSelector._min;
			deliverableTable.itemsSelector._max = this.deliverableSelectionModalData.selectionConstraints?.maxDeliverables ?? deliverableTable.itemsSelector._max;
			deliverableTable.itemsSelector.selectMultiple(this.deliverableSelectionModalData.alreadySelectedDeliverables ?? []);
			deliverableTable.paginator.setAlwaysOnFilters(this.deliverableSelectionModalData.filters ?? []);
		});

		dialogCloser$(this._dialogRef)
			.pipe(
				takeUntilDestroyed(),
				tap(() => this.dismiss())
			)
			.subscribe();
	}

	close(result?: DeliverableSelectionModalResult) {
		this._dialogRef.close(result);
	}

	dismiss() {
		this._dialogRef.close();
	}

	save() {
		this.close({ deliverables: this.deliverableTableChild().itemsSelector.selectedItems });
	}

	cancel() {
		this.dismiss();
	}
}
