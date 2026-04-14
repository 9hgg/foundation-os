import { DialogRef } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { FacilityTypeEnum } from '@edf/edf-project-rands/models';

export interface FacilityCreateModalResult {
	name: string;
	type: FacilityTypeEnum;
}

@Component({
	selector: 'lib-facility-create-modal',
	standalone: true,
	imports: [CommonModule, FormsModule],
	template: `
		<div class="modal-box bg-base-100 w-full max-w-md overflow-hidden rounded-2xl p-0 shadow-2xl">
			<!-- Header -->
			<div class="bg-base-200/50 border-base-200 flex items-center justify-between border-b px-6 py-4">
				<h3 class="flex items-center gap-2 text-lg font-bold">Create facility</h3>
				<button (click)="cancel()" class="btn btn-sm btn-circle btn-ghost">✕</button>
			</div>

			<!-- Content -->
			<div class="p-6 space-y-4">
				<div>
					<label for="name" class="label"><span class="label-text">Name</span></label>
					<input id="name" class="input input-bordered w-full" [ngModel]="name()" (ngModelChange)="name.set($event)" />
				</div>

				<div>
					<label for="type" class="label"><span class="label-text">Type</span></label>
					<select id="type" class="select select-bordered w-full" [ngModel]="type()" (ngModelChange)="type.set($event)">
						<option [value]="'testing'">Testing</option>
						<option [value]="'transverse'">Transverse</option>
					</select>
				</div>
			</div>

			<!-- Footer -->
			<div class="bg-base-200/50 border-base-200 flex justify-end gap-2 border-t px-6 py-4">
				<button class="btn btn-ghost" (click)="cancel()">Cancel</button>
				<button class="btn btn-primary" [disabled]="!name()" (click)="save()">Create</button>
			</div>
		</div>
	`,
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FacilityCreateModalComponent {
	private _dialogRef = inject(DialogRef);

	name = signal<string>('');
	type = signal<FacilityTypeEnum>(FacilityTypeEnum.TESTING);

	close(result?: FacilityCreateModalResult) {
		this._dialogRef.close(result);
	}

	cancel() {
		this.close();
	}

	save() {
		this.close({
			name: this.name(),
			type: this.type(),
		});
	}
}
