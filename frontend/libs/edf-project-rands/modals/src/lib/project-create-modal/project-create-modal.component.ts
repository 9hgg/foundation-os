import { DialogRef } from '@angular/cdk/dialog';
import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal, effect } from '@angular/core';
import { CustomersRepository, ContributorsRepository } from '@edf/edf-project-rands/state';
import { FormsModule } from '@angular/forms';
import { Project } from '@edf/edf-project-rands/models';
import { ContributorsModals } from '../contributors.modals';
import { CustomersModals } from '../customers.modals';

export interface ProjectCreateModalResult {
	name: string;
	code: string;
	description?: string;
	startDate?: string;
	endDate?: string;
	config: Project['config'];
}

@Component({
	selector: 'lib-project-create-modal',
	standalone: true,
	imports: [CommonModule, FormsModule],
	template: `
		<div class="modal-box bg-base-100 w-full max-w-lg overflow-hidden rounded-2xl p-0 shadow-2xl">
			<!-- Header -->
			<div class="bg-base-200/50 border-base-200 flex items-center justify-between border-b px-6 py-4">
				<h3 class="flex items-center gap-2 text-lg font-bold">Create project</h3>
				<button
					(click)="cancel()"
					class="btn btn-sm btn-circle btn-ghost"
				>
					✕
				</button>
			</div>

			<!-- Content -->
			<div class="space-y-4 p-6">
				<div>
					<label
						for="name"
						class="label"
						><span class="label-text">Name</span></label
					>
					<input
						id="name"
						class="input input-bordered w-full"
						[ngModel]="name()"
						(ngModelChange)="name.set($event)"
					/>
				</div>

				<div class="grid grid-cols-2 gap-4">
					<div>
						<label
							for="code"
							class="label"
							><span class="label-text">Code</span></label
						>
						<input
							id="code"
							class="input input-bordered w-full"
							[ngModel]="code()"
							(ngModelChange)="code.set($event)"
						/>
					</div>
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
						[ngModel]="description()"
						(ngModelChange)="description.set($event)"
					></textarea>
				</div>

				<div class="grid grid-cols-2 gap-4">
					<div>
						<label
							for="startDate"
							class="label"
							><span class="label-text">Start date</span></label
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
							><span class="label-text">End date</span></label
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

				<div class="grid grid-cols-2 gap-4">
					<div>
						<label
							for="mainCustomer"
							class="label"
							><span class="label-text">Main customer (optional)</span></label
						>
						<div class="flex items-center gap-2">
							<div class="flex-1 text-sm">{{ mainCustomerName() || (mainCustomerId() ? (mainCustomerId() | slice:0:8) : '—') }}</div>
							<button
								class="btn btn-xs btn-outline"
								(click)="selectCustomer('main')"
							>
								Select
							</button>
							<button
								class="btn btn-xs btn-ghost"
								(click)="clear('main')"
							>
								Clear
							</button>
						</div>
					</div>

					<div>
						<label
							for="sponsorCustomer"
							class="label"
							><span class="label-text">Sponsor customer (optional)</span></label>
						<div class="flex items-center gap-2">
							<div class="flex-1 text-sm">{{ sponsorCustomerName() || (sponsorCustomerId() ? (sponsorCustomerId() | slice:0:8) : '—') }}</div>
							<button
								class="btn btn-xs btn-outline"
								(click)="selectCustomer('sponsor')"
							>
								Select
							</button>
							<button
								class="btn btn-xs btn-ghost"
								(click)="clear('sponsor')"
							>
								Clear
							</button>
						</div>
						<div class="label"><span class="label-text">Project manager (optional)</span></div>
						<div class="flex items-center gap-2">
							<div class="flex-1 text-sm">{{ projectManagerName() || (projectManagerContributorId() ? (projectManagerContributorId() | slice:0:8) : '—') }}</div>
							<button class="btn btn-xs btn-outline" (click)="selectContributor('pm')">Select</button>
							<button class="btn btn-xs btn-ghost" (click)="clear('pm')">Clear</button>
						</div>
					</div>
					<div>
						<div class="label"><span class="label-text">Strategic lead (optional)</span></div>
						<div class="flex items-center gap-2">
							<div class="flex-1 text-sm">{{ strategicLeadName() || (strategicLeadContributorId() ? (strategicLeadContributorId() | slice:0:8) : '—') }}</div>
							<button class="btn btn-xs btn-outline" (click)="selectContributor('strategic')">Select</button>
							<button class="btn btn-xs btn-ghost" (click)="clear('strategic')">Clear</button>
						</div>
					</div>
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
					[disabled]="!name()"
					(click)="save()"
				>
					Create
				</button>
			</div>
		</div>
	`,
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProjectCreateModalComponent {
	private _dialogRef = inject(DialogRef);
	private _customersModals = inject(CustomersModals);
	private _contributorsModals = inject(ContributorsModals);
	private _customersRepository = inject(CustomersRepository);
	private _contributorsRepository = inject(ContributorsRepository);

	name = signal<string>('');
	code = signal<string>('NEW');
	description = signal<string>('');
	startDate = signal<string | null>(null);
	endDate = signal<string | null>(null);
	mainCustomerId = signal<string | null>(null);
	sponsorCustomerId = signal<string | null>(null);
	projectManagerContributorId = signal<string | null>(null);
	strategicLeadContributorId = signal<string | null>(null);

	mainCustomerName = signal<string | null>(null);
	sponsorCustomerName = signal<string | null>(null);
	projectManagerName = signal<string | null>(null);
	strategicLeadName = signal<string | null>(null);

	constructor() {
		effect((onCleanup) => {
			const id = this.mainCustomerId();
			if (!id) {
				this.mainCustomerName.set(null);
				return;
			}
			const sub = this._customersRepository.store.getObjectByIdPullOnce$$$(id).$?.subscribe((c) => {
				if (c) this.mainCustomerName.set([c.firstName, c.lastName].filter(Boolean).join(' '));
			});
			onCleanup(() => sub?.unsubscribe());
		});

		effect((onCleanup) => {
			const id = this.sponsorCustomerId();
			if (!id) {
				this.sponsorCustomerName.set(null);
				return;
			}
			const sub = this._customersRepository.store.getObjectByIdPullOnce$$$(id).$?.subscribe((c) => {
				if (c) this.sponsorCustomerName.set([c.firstName, c.lastName].filter(Boolean).join(' '));
			});
			onCleanup(() => sub?.unsubscribe());
		});

		effect((onCleanup) => {
			const id = this.projectManagerContributorId();
			if (!id) {
				this.projectManagerName.set(null);
				return;
			}
			const sub = this._contributorsRepository.store.getObjectByIdPullOnce$$$(id).$?.subscribe((c) => {
				if (c) this.projectManagerName.set([c.firstName, c.lastName].filter(Boolean).join(' '));
			});
			onCleanup(() => sub?.unsubscribe());
		});

		effect((onCleanup) => {
			const id = this.strategicLeadContributorId();
			if (!id) {
				this.strategicLeadName.set(null);
				return;
			}
			const sub = this._contributorsRepository.store.getObjectByIdPullOnce$$$(id).$?.subscribe((c) => {
				if (c) this.strategicLeadName.set([c.firstName, c.lastName].filter(Boolean).join(' '));
			});
			onCleanup(() => sub?.unsubscribe());
		});
	}

	async selectCustomer(kind: 'main' | 'sponsor') {
		const dialogRef = this._customersModals.openCustomerSelectDialog({
			selectionConstraints: {
				single: true,
				minCustomers: 1,
				maxCustomers: 1,
			},
			alreadySelectedCustomers: [],
		});
		dialogRef.closed.subscribe((result) => {
			if (!result || result.customers.length === 0) return;
			const firstCustomer = result.customers[0];
			if (kind === 'main') this.mainCustomerId.set(firstCustomer.id);
			if (kind === 'sponsor') this.sponsorCustomerId.set(firstCustomer.id);
		});
	}

	async selectContributor(kind: 'pm' | 'strategic') {
		const dialogRef = this._contributorsModals.openContributorSelectDialog({
			selectionConstraints: {
				single: true,
				minContributors: 1,
				maxContributors: 1,
			},
			alreadySelectedContributors: [],
		});
		dialogRef.closed.subscribe((result) => {
			if (!result || result.contributors.length === 0) return;
			const firstContributor = result.contributors[0];
			if (kind === 'pm') this.projectManagerContributorId.set(firstContributor.id);
			if (kind === 'strategic') this.strategicLeadContributorId.set(firstContributor.id);
		});
	}

	clear(kind: 'main' | 'sponsor' | 'pm' | 'strategic') {
		if (kind === 'main') this.mainCustomerId.set(null);
		if (kind === 'sponsor') this.sponsorCustomerId.set(null);
		if (kind === 'pm') this.projectManagerContributorId.set(null);
		if (kind === 'strategic') this.strategicLeadContributorId.set(null);
	}

	close(result?: ProjectCreateModalResult) {
		this._dialogRef.close(result);
	}

	cancel() {
		this.close();
	}

	save() {
		this.close({
			name: this.name(),
			code: this.code(),
			description: this.description() || undefined,
			startDate: this.startDate() || undefined,
			endDate: this.endDate() || undefined,
			config: {
				//
				mainCustomerId: this.mainCustomerId() || undefined,
				sponsorCustomerId: this.sponsorCustomerId() || undefined,
				projectManagerContributorId: this.projectManagerContributorId() || undefined,
				strategicLeadContributorId: this.strategicLeadContributorId() || undefined,
			},
		});
	}
}
