/* eslint-disable @angular-eslint/prefer-inject */
import { AnnualFacilityUsage, getOverheadCoefficient } from '@edf/edf-project-rands/models';
import { AnnualFacilityUsagesRepository } from '@edf/edf-project-rands/state';
import { BehaviorType, RepositoryTableComponent } from '@foundation/table/ui';
import { TranslateDirective } from '@foundation/translations/services';
import { CommonModule } from '@angular/common';
import { Attribute, ChangeDetectionStrategy, Component, EventEmitter, Output, input, signal } from '@angular/core';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { map, take } from 'rxjs';
import { FacilityPillComponent } from '../facility-pill/facility-pill.component';
import { v4 as uuidv4 } from 'uuid';

@Component({
	selector: 'lib-annual-facility-usage-table',
	standalone: true,
	imports: [CommonModule, TranslateDirective, ReactiveFormsModule, FormsModule, FacilityPillComponent],
	templateUrl: './annual-facility-usage-table.component.html',
	styleUrl: './annual-facility-usage-table.component.css',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AnnualFacilityUsageTableComponent extends RepositoryTableComponent<AnnualFacilityUsage, AnnualFacilityUsagesRepository> {
	@Output() removeRequested = new EventEmitter<AnnualFacilityUsage>();
	@Output() refreshRequested = new EventEmitter<void>();
	@Output() addFallbackRequested = new EventEmitter<void>();
	inlineEditable = input<boolean>(false);
	activityId = input<string | null>(null);

	totalBilledAmountKeur = signal<number | null>(null);
	editingUsageId = signal<string | null>(null);
	editYear = signal<number>(new Date().getFullYear());
	editCost = signal<number>(0);

	constructor(
		private _repository: AnnualFacilityUsagesRepository,
		@Attribute('click-behavior') clickBehavior: BehaviorType
	) {
		super(
			_repository,
			{
				orderingBy: { fieldName: 'year', direction: 'desc' },
				alwaysOnFilters: [],
			},
			clickBehavior
		);

		toObservable(this.explicitItems)
			.pipe(
				map((items) => {
					const usages = items?.filter((item): item is AnnualFacilityUsage => !!item) ?? [];
					if (usages.length === 0) return 0;
					return usages.reduce((total, usage) => {
						const billed = this.getBilledAmountKeur(usage);
						return billed === null ? total : total + billed;
					}, 0);
				})
			)
			.pipe(takeUntilDestroyed())
			.subscribe((total) => this.totalBilledAmountKeur.set(total));
	}

	requestRemove(usage: AnnualFacilityUsage, event?: Event) {
		event?.stopImmediatePropagation();
		this.removeRequested.emit(usage);
	}


	getOverheadCoefficient(usage: AnnualFacilityUsage): number | null {
		try {
			return getOverheadCoefficient(usage.year);
		} catch {
			return null;
		}
	}

	getBilledAmountKeur(usage: AnnualFacilityUsage): number | null {
		const overheadCoefficient = this.getOverheadCoefficient(usage);
		if (overheadCoefficient === null) return null;
		return Math.round((usage.cost * overheadCoefficient) / 10) / 100;
	}

	formulaHtml(usage: AnnualFacilityUsage): string {
		const overheadCoefficient = this.getOverheadCoefficient(usage);
		const billedAmountKeur = this.getBilledAmountKeur(usage);
		if (overheadCoefficient === null || billedAmountKeur === null) return '—';
		return `${usage.cost}€ × ${overheadCoefficient} = <strong>${billedAmountKeur}k€</strong>`;
	}

	formatKeur(value: number): string {
		return value.toFixed(2).replace('.', ',');
	}

	editableYears(): number[] {
		const years = new Set<number>();
		const items = this.explicitItems() ?? [];
		items
			.filter((item): item is AnnualFacilityUsage => !!item)
			.forEach((usage) => years.add(usage.year));
		const currentYear = new Date().getFullYear();
		for (let year = currentYear - 2; year <= currentYear + 5; year += 1) {
			years.add(year);
		}
		return Array.from(years).sort((a, b) => b - a);
	}

	isEditing(usage: AnnualFacilityUsage): boolean {
		return this.editingUsageId() === usage.id;
	}

	startEdit(usage: AnnualFacilityUsage, event?: Event) {
		event?.stopImmediatePropagation();
		this.editingUsageId.set(usage.id);
		this.editYear.set(usage.year);
		this.editCost.set(usage.cost);
	}

	cancelEdit(event?: Event) {
		event?.stopImmediatePropagation();
		this.editingUsageId.set(null);
	}

	saveEdit(usage: AnnualFacilityUsage, event?: Event) {
		event?.stopImmediatePropagation();
		const updated: AnnualFacilityUsage = {
			...usage,
			year: Number(this.editYear()) || usage.year,
			cost: Number(this.editCost()) || 0,
		};
		Object.assign(usage, updated);
		this._repository.store
			.save(updated)
			.pipe(take(1))
			.subscribe(() => this.refreshRequested.emit());
		this.editingUsageId.set(null);
	}

	addInlineUsage(event?: Event) {
		event?.stopImmediatePropagation();
		const activityId = this.activityId() ?? this.getActivityIdFromItems();
		const facilityId = this.defaultFacilityId();
		if (!activityId || !facilityId) {
			this.addFallbackRequested.emit();
			return;
		}
		const payload: AnnualFacilityUsage = {
			id: uuidv4(),
			activityId,
			facilityId,
			year: new Date().getFullYear(),
			cost: 0,
		};
		this._repository.store
			.postObject$(payload)
			.pipe(take(1))
			.subscribe((response) => {
				const created = response?.result?.data ?? payload;
				this.prependUsage(created);
				this.startEdit(created);
				this.refreshRequested.emit();
			});
	}

	duplicateUsage(usage: AnnualFacilityUsage, event?: Event) {
		event?.stopImmediatePropagation();
		const payload: AnnualFacilityUsage = {
			...usage,
			id: uuidv4(),
			year: usage.year + 1,
		};
		this._repository.store
			.postObject$(payload)
			.pipe(take(1))
			.subscribe((response) => {
				const created = response?.result?.data ?? payload;
				this.prependUsage(created);
				this.startEdit(created);
				this.refreshRequested.emit();
			});
	}

	private getActivityIdFromItems(): string | null {
		const firstItem = this.explicitItems()?.find((item): item is AnnualFacilityUsage => !!item);
		return firstItem?.activityId ?? null;
	}

	private defaultFacilityId(): string | null {
		const firstItem = this.explicitItems()?.find((item): item is AnnualFacilityUsage => !!item);
		return firstItem?.facilityId ?? null;
	}

	private prependUsage(usage: AnnualFacilityUsage) {
		const current = (this.explicitItems() ?? []).filter((item): item is AnnualFacilityUsage => !!item);
		if (current.some((item) => item.id === usage.id)) return;
		this.explicitItems.set([usage, ...current]);
	}
}
