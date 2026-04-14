/* eslint-disable @angular-eslint/prefer-inject */
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, effect, Inject, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { Customer } from '@edf/edf-project-rands/models';
import { CustomerTableComponent } from '@edf/edf-project-rands/ui';
import { Filter } from '@foundation/network/store';
import { TranslateDirective } from '@foundation/translations/services';
import { dialogCloser$ } from '@foundation/utils';
import { tap } from 'rxjs';

export interface CustomerSelectionConstraints {
	maxCustomers?: number;
	minCustomers?: number;
	single: boolean;
}

export interface CustomerSelectionModalData {
	selectionConstraints?: CustomerSelectionConstraints;
	filters?: Filter[];
	alreadySelectedCustomers?: Customer[];
}

export const DEFAULT_FILE_SELECTION_MODAL_DATA: Partial<CustomerSelectionModalData> & Required<Pick<CustomerSelectionModalData, 'selectionConstraints'>> = {
	selectionConstraints: {
		maxCustomers: 1,
		minCustomers: 1,
		single: true,
	},
};

export interface CustomerSelectionModalResult {
	customers: Customer[];
}

@Component({
	selector: 'lib-customers-selection-modal',
	standalone: true,
	imports: [FormsModule, TranslateDirective, CustomerTableComponent, RouterModule],
	templateUrl: './customers-selection-modal.component.html',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CustomersSelectionModalComponent {
	customerTableChild = viewChild.required(CustomerTableComponent);

	constructor(
		private _dialogRef: DialogRef<CustomerSelectionModalResult, CustomersSelectionModalComponent>,
		@Inject(DIALOG_DATA)
		public customerSelectionModalData: CustomerSelectionModalData
	) {
		effect(() => {
			const customerTable = this.customerTableChild();
			customerTable.itemsSelector._min = this.customerSelectionModalData.selectionConstraints?.minCustomers ?? customerTable.itemsSelector._min;
			customerTable.itemsSelector._max = this.customerSelectionModalData.selectionConstraints?.maxCustomers ?? customerTable.itemsSelector._max;
			customerTable.itemsSelector.selectMultiple(this.customerSelectionModalData.alreadySelectedCustomers ?? []);
			customerTable.paginator.setAlwaysOnFilters(this.customerSelectionModalData.filters ?? []);
		});

		dialogCloser$(this._dialogRef)
			.pipe(
				takeUntilDestroyed(),
				tap(() => this.dismiss())
			)
			.subscribe();
	}

	close(result?: CustomerSelectionModalResult) {
		this._dialogRef.close(result);
	}

	dismiss() {
		this._dialogRef.close();
	}

	save() {
		this.close({ customers: this.customerTableChild().itemsSelector.selectedItems });
	}

	cancel() {
		this.dismiss();
	}
}
