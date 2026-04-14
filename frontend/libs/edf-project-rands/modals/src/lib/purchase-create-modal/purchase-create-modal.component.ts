import { DialogRef, DIALOG_DATA } from '@angular/cdk/dialog';
import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Activity } from '@edf/edf-project-rands/models';
import { ActivitiesRepository } from '@edf/edf-project-rands/state';

export interface PurchaseCreateModalData {
	activityId?: string;
	title?: string;
	year?: number;
	details?: string;
	estimatedCost?: number;
	supplier?: string;
}

export interface PurchaseCreateModalResult {
	title: string;
	year: number;
	activityId: string;
	details?: string;
	estimatedCost?: number;
	supplier?: string;
}

@Component({
	selector: 'lib-purchase-create-modal',
	standalone: true,
	imports: [CommonModule, FormsModule],
	template: `
		<div class="modal-box bg-base-100 w-full max-w-md overflow-hidden rounded-2xl p-0 shadow-2xl">
			<div class="bg-base-200/50 border-base-200 flex items-center justify-between border-b px-6 py-4">
				<h3 class="flex items-center gap-2 text-lg font-bold">Create purchase</h3>
				<button
					(click)="cancel()"
					class="btn btn-sm btn-circle btn-ghost"
				>
					✕
				</button>
			</div>

			<div class="space-y-4 p-6">
				<div>
					<label
						for="title"
						class="label"
						><span class="label-text">Title</span></label
					>
					<input
						id="title"
						class="input input-bordered w-full"
						[ngModel]="title()"
						(ngModelChange)="title.set($event)"
					/>
				</div>

				<div>
					<label
						for="year"
						class="label"
						><span class="label-text">Year</span></label
					>
					<input
						id="year"
						type="number"
						class="input input-bordered w-full"
						[ngModel]="year()"
						(ngModelChange)="year.set(+$event)"
					/>
				</div>

				<div>
					<label
						for="activity"
						class="label"
						><span class="label-text">Activity</span></label
					>
					<select
						id="activity"
						class="select select-bordered w-full"
						[ngModel]="activityId()"
						(ngModelChange)="activityId.set($event)"
					>
						<option value="">-- select activity --</option>
						@for (a of activities(); track a.id) {
							<option [value]="a.id">{{ a.title }}</option>
						}
					</select>
				</div>

				<div>
					<label
						for="estimatedCost"
						class="label"
						><span class="label-text">Estimated cost (optional)</span></label
					>
					<input
						id="estimatedCost"
						type="number"
						class="input input-bordered w-full"
						[ngModel]="estimatedCost()"
						(ngModelChange)="estimatedCost.set(+$event || 0)"
					/>
				</div>

				<div>
					<label
						for="supplier"
						class="label"
						><span class="label-text">Supplier (optional)</span></label
					>
					<input
						id="supplier"
						class="input input-bordered w-full"
						[ngModel]="supplier()"
						(ngModelChange)="supplier.set($event)"
					/>
				</div>

				<div>
					<label
						for="details"
						class="label"
						><span class="label-text">Details (optional)</span></label
					>
					<textarea
						id="details"
						class="textarea textarea-bordered w-full"
						[ngModel]="details()"
						(ngModelChange)="details.set($event)"
					></textarea>
				</div>
			</div>

			<div class="bg-base-200/50 border-base-200 flex justify-end gap-2 border-t px-6 py-4">
				<button
					class="btn btn-ghost"
					(click)="cancel()"
				>
					Cancel
				</button>
				<button
					class="btn btn-primary"
					[disabled]="!title() || !activityId()"
					(click)="save()"
				>
					Create
				</button>
			</div>
		</div>
	`,
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PurchaseCreateModalComponent {
	private _dialogRef = inject(DialogRef);
	private _activitiesRepository = inject(ActivitiesRepository);
	private _data = inject<PurchaseCreateModalData | undefined>(DIALOG_DATA);

	title = signal<string>('');
	year = signal<number>(new Date().getFullYear());
	activityId = signal<string | null>(null);
	estimatedCost = signal<number | null>(null);
	supplier = signal<string>('');
	details = signal<string>('');

	activities() {
		this._activitiesRepository.store.getObjects$(1, 200, [], undefined, true).subscribe();
		return this._activitiesRepository.store.objects$$$.value.filter((a: Activity | null): a is Activity => !!a);
	}

	constructor() {
		if (this._data?.title) this.title.set(this._data.title);
		if (this._data?.year) this.year.set(this._data.year);
		if (this._data?.activityId) this.activityId.set(this._data.activityId);
		if (this._data?.details) this.details.set(this._data.details);
		if (this._data?.estimatedCost !== undefined) this.estimatedCost.set(this._data.estimatedCost);
		if (this._data?.supplier) this.supplier.set(this._data.supplier);
	}

	close(result?: PurchaseCreateModalResult) {
		this._dialogRef.close(result);
	}

	cancel() {
		this.close();
	}

	save() {
		this.close({
			title: this.title(),
			year: this.year(),
			activityId: this.activityId() || '',
			estimatedCost: this.estimatedCost() || undefined,
			supplier: this.supplier() || undefined,
			details: this.details() || undefined,
		});
	}
}
