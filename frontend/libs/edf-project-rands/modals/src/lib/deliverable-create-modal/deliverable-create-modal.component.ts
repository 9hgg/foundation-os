import { DialogRef } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Customer } from '@edf/edf-project-rands/models';
import { CustomersModals } from '@edf/edf-project-rands/modals';
import { CustomerPillComponent } from '@edf/edf-project-rands/ui';

export interface DeliverableCreateModalResult {
	title: string;
	description?: string;
	customerId?: string;
	startDate?: string;
	endDate?: string;
	isPrincipal?: boolean;
}

@Component({
	selector: 'lib-deliverable-create-modal',
	standalone: true,
	imports: [CommonModule, FormsModule, CustomerPillComponent],
	template: `
		<div class="modal-box bg-base-100 w-full max-w-md overflow-hidden rounded-2xl p-0 shadow-2xl">
			<div class="bg-base-200/50 border-base-200 flex items-center justify-between border-b px-6 py-4">
				<h3 class="flex items-center gap-2 text-lg font-bold">Create deliverable</h3>
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
						for="description"
						class="label"
						><span class="label-text">Description</span></label
					>
					<textarea
						id="description"
						class="textarea textarea-bordered w-full"
						rows="4"
						[ngModel]="description()"
						(ngModelChange)="description.set($event)"
					></textarea>
				</div>

				<div>
					<label
						for="customer-selector"
						class="label"
						><span class="label-text">Customer (optional)</span></label
					>
					<div class="flex items-center gap-2">
						<button
							id="customer-selector"
							type="button"
							class="btn btn-outline btn-sm"
							(click)="selectCustomer()"
						>
							@if (selectedCustomer()) {
								<lib-customer-pill [customerId]="selectedCustomer()?.id || null"></lib-customer-pill>
							} @else {
								<span class="opacity-60">Select customer</span>
							}
						</button>
						@if (selectedCustomer()) {
							<button
								type="button"
								class="btn btn-ghost btn-sm"
								(click)="clearCustomer()"
							>
								Clear
							</button>
						}
					</div>
				</div>

				<div class="grid grid-cols-2 gap-4">
					<div>
						<label
							for="startDate"
							class="label"
							><span class="label-text">Start date (optional)</span></label
						>
						<input
							id="startDate"
							type="date"
							class="input input-bordered w-full"
							[ngModel]="startDate()"
							(ngModelChange)="startDate.set($event)"
						/>
					</div>
					<div>
						<label
							for="endDate"
							class="label"
							><span class="label-text">End date (optional)</span></label
						>
						<input
							id="endDate"
							type="date"
							class="input input-bordered w-full"
							[ngModel]="endDate()"
							(ngModelChange)="endDate.set($event)"
						/>
					</div>
				</div>

				<div>
					<label
						for="isPrincipal"
						class="label"
						><span class="label-text">Is principal</span></label
					>
					<input
						id="isPrincipal"
						type="checkbox"
						class="checkbox"
						[checked]="isPrincipal()"
						(change)="isPrincipal.set($any($event.target).checked)"
					/>
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
					[disabled]="!title()"
					(click)="save()"
				>
					Create
				</button>
			</div>
		</div>
	`,
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DeliverableCreateModalComponent {
	private _dialogRef = inject(DialogRef);
	private _customersModals = inject(CustomersModals);

	title = signal<string>('');
	description = signal<string>('');
	customerId = signal<string | null>(null);
	selectedCustomer = signal<Customer | null>(null);
	startDate = signal<string | null>(null);
	endDate = signal<string | null>(null);
	isPrincipal = signal<boolean>(false);

	selectCustomer() {
		const alreadySelected = this.selectedCustomer();
		const dialogRef = this._customersModals.openCustomerSelectDialog({
			selectionConstraints: { single: true, maxCustomers: 1, minCustomers: 1 },
			alreadySelectedCustomers: alreadySelected ? [alreadySelected] : [],
		});
		dialogRef.closed.subscribe((result) => {
			const customer = result?.customers?.[0] ?? null;
			this.selectedCustomer.set(customer);
			this.customerId.set(customer?.id ?? null);
		});
	}

	clearCustomer() {
		this.selectedCustomer.set(null);
		this.customerId.set(null);
	}

	close(result?: DeliverableCreateModalResult) {
		this._dialogRef.close(result);
	}

	cancel() {
		this.close();
	}

	save() {
		this.close({
			title: this.title(),
			description: this.description() || undefined,
			customerId: this.customerId() || undefined,
			startDate: this.startDate() || undefined,
			endDate: this.endDate() || undefined,
			isPrincipal: this.isPrincipal() || undefined,
		});
	}
}
