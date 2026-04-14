import { DialogRef, DIALOG_DATA } from '@angular/cdk/dialog';
import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { FacilitiesModals } from '../facilities.modals';
import { Facility } from '@edf/edf-project-rands/models';

export interface AnnualFacilityUsageCreateModalData {
	activityId: string;
}

export interface AnnualFacilityUsageCreateModalResult {
	activityId: string;
	facilityId: string;
	year: number;
	cost: number;
}

@Component({
	selector: 'lib-annual-facility-usage-create-modal',
	standalone: true,
	imports: [CommonModule, FormsModule],
	template: `
		<div class="modal-box bg-base-100 w-full max-w-md overflow-hidden rounded-2xl p-0 shadow-2xl">
			<div class="bg-base-200/50 border-base-200 flex items-center justify-between border-b px-6 py-4">
				<h3 class="flex items-center gap-2 text-lg font-bold">Add annual facility usage</h3>
				<button (click)="cancel()" class="btn btn-sm btn-circle btn-ghost">✕</button>
			</div>

			<div class="space-y-4 p-6">
				<div>
					<div class="label"><span class="label-text">Facility</span></div>
					<div class="flex items-center gap-2">
						<div class="flex-1 text-sm">
							@if (selectedFacility()) {
								{{ selectedFacility()?.name }}
							} @else {
								—
							}
						</div>
						<button class="btn btn-xs btn-outline" (click)="selectFacility()">Select</button>
						<button class="btn btn-xs btn-ghost" (click)="clearFacility()">Clear</button>
					</div>
				</div>

				<div class="grid grid-cols-2 gap-4">
					<div>
						<label for="year" class="label"><span class="label-text">Year</span></label>
						<input id="year" type="number" class="input input-bordered w-full" [ngModel]="year()" (ngModelChange)="year.set(+$event || currentYear)" />
					</div>
					<div>
						<label for="cost" class="label"><span class="label-text">Cost</span></label>
						<input id="cost" type="number" class="input input-bordered w-full" [ngModel]="cost()" (ngModelChange)="cost.set(+$event || 0)" />
					</div>
				</div>
			</div>

			<div class="bg-base-200/50 border-base-200 flex justify-end gap-2 border-t px-6 py-4">
				<button class="btn btn-ghost" (click)="cancel()">Cancel</button>
				<button class="btn btn-primary" [disabled]="!facilityId()" (click)="save()">Add</button>
			</div>
		</div>
	`,
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AnnualFacilityUsageCreateModalComponent {
	private _dialogRef = inject(DialogRef);
	private _facilitiesModals = inject(FacilitiesModals);
	private _data = inject<AnnualFacilityUsageCreateModalData>(DIALOG_DATA);

	activityId = signal<string>('');
	facilityId = signal<string | null>(null);
	selectedFacility = signal<Facility | null>(null);
	year = signal<number>(new Date().getFullYear());
	cost = signal<number>(0);
	currentYear = new Date().getFullYear();

	constructor() {
		if (this._data?.activityId) this.activityId.set(this._data.activityId);
	}

	selectFacility() {
		const selected = this.selectedFacility();
		const alreadySelected = selected ? [selected] : [];
		const dialogRef = this._facilitiesModals.openFacilitySelectDialog({
			selectionConstraints: {
				single: true,
				minFacilities: 1,
				maxFacilities: 1,
			},
			alreadySelectedFacilities: alreadySelected,
		});

		dialogRef.closed.subscribe((result) => {
			if (!result || result.facilities.length === 0) return;
			const first = result.facilities[0];
			this.facilityId.set(first.id);
			this.selectedFacility.set(first);
		});
	}

	clearFacility() {
		this.facilityId.set(null);
		this.selectedFacility.set(null);
	}

	close(result?: AnnualFacilityUsageCreateModalResult) {
		this._dialogRef.close(result);
	}

	cancel() {
		this.close();
	}

	save() {
		this.close({
			activityId: this.activityId(),
			facilityId: this.facilityId() || '',
			year: this.year(),
			cost: this.cost(),
		});
	}
}
