import { DialogRef } from '@angular/cdk/dialog';
import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

export interface CustomerCreateModalResult {
	firstName?: string;
	lastName?: string;
	identifier?: string;
	unit?: string;
	referentId?: string;
	technicalReferentId?: string;
}

@Component({
	selector: 'lib-customer-create-modal',
	standalone: true,
	imports: [CommonModule, FormsModule],
	template: `
		<div class="modal-box bg-base-100 w-full max-w-md overflow-hidden rounded-2xl p-0 shadow-2xl">
			<!-- Header -->
			<div class="bg-base-200/50 border-base-200 flex items-center justify-between border-b px-6 py-4">
				<h3 class="flex items-center gap-2 text-lg font-bold">Create customer</h3>
				<button
					(click)="cancel()"
					class="btn btn-sm btn-circle btn-ghost"
				>
					✕
				</button>
			</div>

			<!-- Content -->
			<div class="space-y-4 p-6">
				<div class="grid grid-cols-2 gap-4">
					<div>
						<label
							for="firstName"
							class="label"
							><span class="label-text">First name (optional)</span></label
						>
						<input
							id="firstName"
							class="input input-bordered w-full"
							[ngModel]="firstName()"
							(ngModelChange)="firstName.set($event)"
						/>
					</div>
					<div>
						<label
							for="lastName"
							class="label"
							><span class="label-text">Last name (optional)</span></label
						>
						<input
							id="lastName"
							class="input input-bordered w-full"
							[ngModel]="lastName()"
							(ngModelChange)="lastName.set($event)"
						/>
					</div>
				</div>

				<div>
					<label
						for="identifier"
						class="label"
						><span class="label-text">Identifier (optional)</span></label
					>
					<input
						id="identifier"
						class="input input-bordered w-full"
						[ngModel]="identifier()"
						(ngModelChange)="identifier.set($event)"
					/>
				</div>

				<div>
					<label
						for="unit"
						class="label"
						><span class="label-text">Unit (optional)</span></label
					>
					<input
						id="unit"
						class="input input-bordered w-full"
						[ngModel]="unit()"
						(ngModelChange)="unit.set($event)"
					/>
				</div>
			</div>

			<!-- Footer -->
			<div class="bg-base-200/50 border-base-200 flex justify-end gap-2 border-t px-6 py-4">
				<button
					class="btn btn-ghost"
					(click)="cancel()"
				>
					Cancel
				</button>
				<button
					class="btn btn-primary"
					[disabled]="!identifier() && !firstName() && !lastName()"
					(click)="save()"
				>
					Create
				</button>
			</div>
		</div>
	`,
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CustomerCreateModalComponent {
	private _dialogRef = inject(DialogRef);

	firstName = signal<string>('');
	lastName = signal<string>('');
	identifier = signal<string>('');
	unit = signal<string>('');

	close(result?: CustomerCreateModalResult) {
		this._dialogRef.close(result);
	}

	cancel() {
		this.close();
	}

	save() {
		this.close({
			firstName: this.firstName() || undefined,
			lastName: this.lastName() || undefined,
			identifier: this.identifier() || undefined,
			unit: this.unit() || undefined,
		});
	}
}
