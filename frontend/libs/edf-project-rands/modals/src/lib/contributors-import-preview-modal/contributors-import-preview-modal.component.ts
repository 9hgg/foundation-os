import { DialogRef, DIALOG_DATA } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { ContributorPreviewRow } from '@edf/edf-project-rands/models';

export interface ContributorsImportPreviewResult {
	selectedNames: string[];
}

@Component({
	selector: 'lib-contributors-import-preview-modal',
	standalone: true,
	imports: [CommonModule, FormsModule],
	template: `
		<div class="modal-box bg-base-100 w-full max-w-4xl overflow-hidden rounded-2xl p-0 shadow-2xl">
			<!-- Header -->
			<div class="bg-base-200/50 border-base-200 flex items-center justify-between border-b px-6 py-4">
				<h3 class="flex items-center gap-2 text-lg font-bold">Import contributors preview</h3>
				<button (click)="cancel()" class="btn btn-sm btn-circle btn-ghost">✕</button>
			</div>

			<!-- Content -->
			<div class="p-4">
				<div class="flex items-center justify-between mb-3">
					<div class="flex gap-2">
						<button class="btn btn-sm" (click)="selectAll()">Select all</button>
						<button class="btn btn-sm btn-ghost" (click)="clearAll()">Clear</button>
					</div>
					<div class="flex items-center gap-3">
						<div class="btn-group">
							<button class="btn btn-sm" [class.btn-active]="filter() === 'all'" (click)="filter.set('all')">All</button>
							<button class="btn btn-sm" [class.btn-active]="filter() === 'new'" (click)="filter.set('new')">New</button>
							<button class="btn btn-sm" [class.btn-active]="filter() === 'matched'" (click)="filter.set('matched')">Matched</button>
						</div>
						<div class="text-sm opacity-60">Showing <strong>{{ filteredRows().length }}</strong> rows</div>
					</div>
				</div>

				<div class="overflow-auto max-h-96 border rounded">
					<table class="table w-full">
						<thead>
							<tr>
								<th></th>
								<th>Name (Excel)</th>
								<th>Parsed</th>
								<th>NNI</th>
								<th>Group</th>
							<th>Category</th>
							<th>Status</th>
							</tr>
						</thead>
						<tbody>
							<tr *ngFor="let r of filteredRows(); let i = index">
								<td><input type="checkbox" [ngModel]="selections[r.excel_name]()" (ngModelChange)="selections[r.excel_name].set($event)" /></td>
								<td class="whitespace-nowrap">{{ r.excel_name }}</td>
								<td>{{ r.first }} {{ r.last }}</td>
								<td>{{ r.nni || '-' }}</td>
								<td>{{ r.inferred_group || '-' }}</td>
							<td>{{ r.inferred_category || '-' }}</td>
							<td class="whitespace-nowrap">{{ r.state === 'matched' ? 'Matched' : (r.state === 'new' ? 'New' : (r.state || '-')) }}</td>
							</tr>
						</tbody>
					</table>
				</div>
			</div>

			<!-- Footer -->
			<div class="bg-base-200/50 border-base-200 flex justify-end gap-2 border-t px-6 py-4">
				<button class="btn btn-ghost" (click)="cancel()">Cancel</button>
				<button class="btn btn-primary" (click)="confirm()">Import selected</button>
			</div>
		</div>
	`,
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ContributorsImportPreviewModalComponent {
	private _dialogRef = inject(DialogRef);
	private _data = inject(DIALOG_DATA) as ContributorPreviewRow[] | undefined;

	// Data will be passed via dialog open `data` option
	previewRows: ContributorPreviewRow[] = this._data || [];
	// map selections by excel_name to avoid index mismatch when filtering
	selections: Record<string, ReturnType<typeof signal>> = {};
	filter = signal<'all' | 'new' | 'matched'>('all');

	constructor() {
		for (const r of this.previewRows) {
			this.selections[r.excel_name] = signal(true);
		}
	}

	filteredRows() {
		if (this.filter() === 'all') return this.previewRows;
		return this.previewRows.filter((r) => {
			if (this.filter() === 'new') return r.state !== 'matched';
			if (this.filter() === 'matched') return r.state === 'matched';
			return true;
		});
	}

	selectAll() {
		for (const k of Object.keys(this.selections)) this.selections[k].set(true);
	}

	clearAll() {
		for (const k of Object.keys(this.selections)) this.selections[k].set(false);
	}

	cancel() {
		this._dialogRef.close();
	}

	confirm() {
		const selectedNames = this.previewRows.filter((r) => this.selections[r.excel_name]() ).map((r) => r.excel_name);
		this._dialogRef.close({ selectedNames } as ContributorsImportPreviewResult);
	}
}
