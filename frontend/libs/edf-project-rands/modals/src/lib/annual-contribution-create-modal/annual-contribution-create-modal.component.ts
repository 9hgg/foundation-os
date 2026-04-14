import { DialogRef, DIALOG_DATA } from '@angular/cdk/dialog';
import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ContributorsModals } from '../contributors.modals';
import { Contributor } from '@edf/edf-project-rands/models';

export interface AnnualContributionCreateModalData {
	activityId: string;
}

export interface AnnualContributionCreateModalResult {
	activityId: string;
	contributorId: string;
	year: number;
	days: number;
}

@Component({
	selector: 'lib-annual-contribution-create-modal',
	standalone: true,
	imports: [CommonModule, FormsModule],
	template: `
		<div class="modal-box bg-base-100 w-full max-w-md overflow-hidden rounded-2xl p-0 shadow-2xl">
			<div class="bg-base-200/50 border-base-200 flex items-center justify-between border-b px-6 py-4">
				<h3 class="flex items-center gap-2 text-lg font-bold">Add annual contribution</h3>
				<button (click)="cancel()" class="btn btn-sm btn-circle btn-ghost">✕</button>
			</div>

			<div class="space-y-4 p-6">
				<div>
					<div class="label"><span class="label-text">Contributor</span></div>
					<div class="flex items-center gap-2">
						<div class="flex-1 text-sm">
							@if (selectedContributor()) {
								{{ selectedContributor()?.firstName || '' }} {{ selectedContributor()?.lastName || '' }}
							} @else {
								—
							}
						</div>
						<button class="btn btn-xs btn-outline" (click)="selectContributor()">Select</button>
						<button class="btn btn-xs btn-ghost" (click)="clearContributor()">Clear</button>
					</div>
				</div>

				<div class="grid grid-cols-2 gap-4">
					<div>
						<label for="year" class="label"><span class="label-text">Year</span></label>
						<input id="year" type="number" class="input input-bordered w-full" [ngModel]="year()" (ngModelChange)="year.set(+$event || currentYear)" />
					</div>
					<div>
						<label for="days" class="label"><span class="label-text">Days</span></label>
						<input id="days" type="number" class="input input-bordered w-full" [ngModel]="days()" (ngModelChange)="days.set(+$event || 0)" />
					</div>
				</div>
			</div>

			<div class="bg-base-200/50 border-base-200 flex justify-end gap-2 border-t px-6 py-4">
				<button class="btn btn-ghost" (click)="cancel()">Cancel</button>
				<button class="btn btn-primary" [disabled]="!contributorId()" (click)="save()">Add</button>
			</div>
		</div>
	`,
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AnnualContributionCreateModalComponent {
	private _dialogRef = inject(DialogRef);
	private _contributorsModals = inject(ContributorsModals);
	private _data = inject<AnnualContributionCreateModalData>(DIALOG_DATA);

	activityId = signal<string>('');
	contributorId = signal<string | null>(null);
	selectedContributor = signal<Contributor | null>(null);
	year = signal<number>(new Date().getFullYear());
	days = signal<number>(0);
	currentYear = new Date().getFullYear();

	constructor() {
		if (this._data?.activityId) this.activityId.set(this._data.activityId);
	}

	selectContributor() {
		const selected = this.selectedContributor();
		const alreadySelected = selected ? [selected] : [];
		const dialogRef = this._contributorsModals.openContributorSelectDialog({
			selectionConstraints: {
				single: true,
				minContributors: 1,
				maxContributors: 1,
			},
			alreadySelectedContributors: alreadySelected,
		});

		dialogRef.closed.subscribe((result) => {
			if (!result || result.contributors.length === 0) return;
			const first = result.contributors[0];
			this.contributorId.set(first.id);
			this.selectedContributor.set(first);
		});
	}

	clearContributor() {
		this.contributorId.set(null);
		this.selectedContributor.set(null);
	}

	close(result?: AnnualContributionCreateModalResult) {
		this._dialogRef.close(result);
	}

	cancel() {
		this.close();
	}

	save() {
		this.close({
			activityId: this.activityId(),
			contributorId: this.contributorId() || '',
			year: this.year(),
			days: this.days(),
		});
	}
}
