import { DialogRef } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CategoryEnum } from '@edf/edf-project-rands/models';

export interface ContributorCreateModalResult {
	firstName?: string;
	lastName?: string;
	email?: string;
	category?: CategoryEnum;
	unit?: string;
	department?: string;
	group?: string;
}

@Component({
	selector: 'lib-contributor-create-modal',
	standalone: true,
	imports: [CommonModule, FormsModule],
	template: `
		<div class="modal-box bg-base-100 w-full max-w-md overflow-hidden rounded-2xl p-0 shadow-2xl">
			<!-- Header -->
			<div class="bg-base-200/50 border-base-200 flex items-center justify-between border-b px-6 py-4">
				<h3 class="flex items-center gap-2 text-lg font-bold">Create contributor</h3>
				<button (click)="cancel()" class="btn btn-sm btn-circle btn-ghost">✕</button>
			</div>

			<!-- Content -->
			<div class="p-6 space-y-4">
				<div class="grid grid-cols-2 gap-4">
					<div>
						<label for="firstName" class="label"><span class="label-text">First name</span></label>
						<input id="firstName" class="input input-bordered w-full" [ngModel]="firstName()" (ngModelChange)="firstName.set($event)" />
					</div>
					<div>
						<label for="lastName" class="label"><span class="label-text">Last name</span></label>
						<input id="lastName" class="input input-bordered w-full" [ngModel]="lastName()" (ngModelChange)="lastName.set($event)" />
					</div>
				</div>

				<div>
					<label for="email" class="label"><span class="label-text">Email (optional)</span></label>
					<input id="email" type="email" class="input input-bordered w-full" [ngModel]="email()" (ngModelChange)="email.set($event)" />
				</div>

				<div class="grid grid-cols-2 gap-4">
					<div>
						<label for="category" class="label"><span class="label-text">Category (optional)</span></label>
						<select id="category" class="select select-bordered w-full" [ngModel]="category()" (ngModelChange)="category.set($event)">
							<option value="">-- none --</option>
							<option value="A">A</option>
							<option value="B">B</option>
							<option value="C">C</option>
							<option value="D">D</option>
							<option value="E">E</option>
						</select>
					</div>
					<div>
						<label for="unit" class="label"><span class="label-text">Unit (optional)</span></label>
						<input id="unit" class="input input-bordered w-full" [ngModel]="unit()" (ngModelChange)="unit.set($event)" />
					</div>
				</div>

				<div class="grid grid-cols-2 gap-4">
					<div>
						<label for="department" class="label"><span class="label-text">Department (optional)</span></label>
						<input id="department" class="input input-bordered w-full" [ngModel]="department()" (ngModelChange)="department.set($event)" />
					</div>
					<div>
						<label for="group" class="label"><span class="label-text">Group (optional)</span></label>
						<input id="group" class="input input-bordered w-full" [ngModel]="group()" (ngModelChange)="group.set($event)" />
					</div>
				</div>
			</div>

			<!-- Footer -->
			<div class="bg-base-200/50 border-base-200 flex justify-end gap-2 border-t px-6 py-4">
				<button class="btn btn-ghost" (click)="cancel()">Cancel</button>
				<button class="btn btn-primary" [disabled]="!lastName() && !firstName()" (click)="save()">Create</button>
			</div>
		</div>
	`,
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ContributorCreateModalComponent {
	private _dialogRef = inject(DialogRef);

	firstName = signal<string>('');
	lastName = signal<string>('');
	email = signal<string>('');
	category = signal<CategoryEnum | null>(null);
	unit = signal<string>('');
	department = signal<string>('');
	group = signal<string>('');

	close(result?: ContributorCreateModalResult) {
		this._dialogRef.close(result);
	}

	cancel() {
		this.close();
	}

	save() {
		this.close({
			firstName: this.firstName() || undefined,
			lastName: this.lastName() || undefined,
			email: this.email() || undefined,
			category: this.category() || undefined,
			unit: this.unit() || undefined,
			department: this.department() || undefined,
			group: this.group() || undefined,
		});
	}
}
