/* eslint-disable @angular-eslint/prefer-inject */
import { CdkMenu, CdkMenuItem, CdkMenuModule } from '@angular/cdk/menu';
import { CommonModule } from '@angular/common';
import { Attribute, ChangeDetectionStrategy, Component, EventEmitter, Output, inject, input, signal } from '@angular/core';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { getOverheadCoefficient, Purchase } from '@edf/edf-project-rands/models';
import { PurchasesRepository } from '@edf/edf-project-rands/state';
import { AccessService } from '@foundation/shared/access';
import { BehaviorType, RepositoryTableComponent } from '@foundation/table/ui';
import { TranslateDirective, TranslatePipe } from '@foundation/translations/services';
import { switchMap } from 'rxjs';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { map, take } from 'rxjs';
import { v4 as uuidv4 } from 'uuid';

@Component({
	selector: 'lib-purchase-table',
	standalone: true,
	imports: [CommonModule, TranslateDirective, TranslatePipe, ReactiveFormsModule, FormsModule, CdkMenuModule, CdkMenu, CdkMenuItem],
	templateUrl: './purchase-table.component.html',
	styleUrl: './purchase-table.component.css',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PurchaseTableComponent extends RepositoryTableComponent<Purchase, PurchasesRepository> {
	@Output() refreshRequested = new EventEmitter<void>();
	@Output() addFallbackRequested = new EventEmitter<void>();
	inlineEditable = input<boolean>(false);
	activityId = input<string | null>(null);

	totalBilledAmountKeur = signal<number | null>(null);
	editingPurchaseId = signal<string | null>(null);
	editTitle = signal<string>('');
	editYear = signal<number>(new Date().getFullYear());
	editEstimatedCost = signal<number>(0);

	constructor(
		private _repository: PurchasesRepository,
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
					const purchases = items?.filter((item): item is Purchase => !!item) ?? [];
					if (purchases.length === 0) return 0;
					return purchases.reduce((total, purchase) => {
						const billed = this.getBilledAmountKeur(purchase);
						return billed === null ? total : total + billed;
					}, 0);
				})
			)
			.pipe(takeUntilDestroyed())
			.subscribe((total) => this.totalBilledAmountKeur.set(total));
	}

	private _i18n_deleteSentence = this._translationService.prep('Are you sure you want to delete this purchase?');
	private _accessService = inject(AccessService);
	public deletePurchase(purchase: Purchase, event?: Event) {
		event?.stopImmediatePropagation();
		this._notificationService.confirm(this._i18n_deleteSentence()).closed.subscribe((confirmed) => {
			if (!confirmed) return;
			this._repository.store
				.deleteObject$(purchase.id)
				.pipe(switchMap(() => this.paginator.refresh()))
				.subscribe(() => this.refreshRequested.emit());
		});
	}

	public shareWithTeam(purchase: Purchase) {
		this._accessService.shareWithTeam(purchase.id, 'purchase');
	}

	getBaseCost(purchase: Purchase): number | null {
		if (purchase.estimatedCost !== undefined && purchase.estimatedCost !== null) return purchase.estimatedCost;
		if (purchase.maxEstimatedCost !== undefined && purchase.maxEstimatedCost !== null) return purchase.maxEstimatedCost;
		if (purchase.minEstimatedCost !== undefined && purchase.minEstimatedCost !== null) return purchase.minEstimatedCost;
		return null;
	}

	getOverheadCoefficient(purchase: Purchase): number | null {
		try {
			return getOverheadCoefficient(purchase.year);
		} catch {
			return null;
		}
	}

	getBilledAmountKeur(purchase: Purchase): number | null {
		const baseCost = this.getBaseCost(purchase);
		const overheadCoefficient = this.getOverheadCoefficient(purchase);
		if (baseCost === null || overheadCoefficient === null) return null;
		return Math.round((baseCost * overheadCoefficient) / 10) / 100;
	}

	formulaHtml(purchase: Purchase): string {
		const baseCost = this.getBaseCost(purchase);
		const overheadCoefficient = this.getOverheadCoefficient(purchase);
		const billedAmountKeur = this.getBilledAmountKeur(purchase);
		if (baseCost === null || overheadCoefficient === null || billedAmountKeur === null) return '—';
		return `${baseCost}€ × ${overheadCoefficient} = <strong>${billedAmountKeur}k€</strong>`;
	}

	public openSharingDetails(purchase: Purchase) {
		this._accessService.openSharingDetails(purchase.id, 'purchase');
	}

	editableYears(): number[] {
		const years = new Set<number>();
		const items = this.explicitItems() ?? [];
		items
			.filter((item): item is Purchase => !!item)
			.forEach((purchase) => years.add(purchase.year));
		const currentYear = new Date().getFullYear();
		for (let year = currentYear - 2; year <= currentYear + 5; year += 1) {
			years.add(year);
		}
		return Array.from(years).sort((a, b) => b - a);
	}

	isEditing(purchase: Purchase): boolean {
		return this.editingPurchaseId() === purchase.id;
	}

	startEdit(purchase: Purchase, event?: Event) {
		event?.stopImmediatePropagation();
		this.editingPurchaseId.set(purchase.id);
		this.editTitle.set(purchase.title ?? '');
		this.editYear.set(purchase.year);
		this.editEstimatedCost.set(this.getBaseCost(purchase) ?? 0);
	}

	cancelEdit(event?: Event) {
		event?.stopImmediatePropagation();
		this.editingPurchaseId.set(null);
	}

	saveEdit(purchase: Purchase, event?: Event) {
		event?.stopImmediatePropagation();
		const updated: Purchase = {
			...purchase,
			title: this.editTitle().trim(),
			year: Number(this.editYear()) || purchase.year,
			estimatedCost: Number(this.editEstimatedCost()) || 0,
			minEstimatedCost: undefined,
			maxEstimatedCost: undefined,
		};

		Object.assign(purchase, updated);
		this._repository.store
			.save(updated)
			.pipe(take(1))
			.subscribe(() => this.refreshRequested.emit());
		this.editingPurchaseId.set(null);
	}

	addInlinePurchase(event?: Event) {
		event?.stopImmediatePropagation();
		const activityId = this.activityId() ?? this.getActivityIdFromItems();
		if (!activityId) {
			this.addFallbackRequested.emit();
			return;
		}
		const payload: Purchase = {
			id: uuidv4(),
			activityId,
			title: 'New purchase',
			year: new Date().getFullYear(),
			details: '',
			estimatedCost: 0,
			supplier: '',
		};
		this._repository.store
			.postObject$(payload)
			.pipe(take(1))
			.subscribe((response) => {
				const created = response?.result?.data ?? payload;
				this.prependPurchase(created);
				this.startEdit(created);
				this.refreshRequested.emit();
			});
	}

	duplicatePurchase(purchase: Purchase, event?: Event) {
		event?.stopImmediatePropagation();
		const payload: Purchase = {
			...purchase,
			id: uuidv4(),
			year: purchase.year + 1,
		};
		this._repository.store
			.postObject$(payload)
			.pipe(take(1))
			.subscribe((response) => {
				const created = response?.result?.data ?? payload;
				this.prependPurchase(created);
				this.startEdit(created);
				this.refreshRequested.emit();
			});
	}

	private getActivityIdFromItems(): string | null {
		const firstItem = this.explicitItems()?.find((item): item is Purchase => !!item);
		return firstItem?.activityId ?? null;
	}

	private prependPurchase(purchase: Purchase) {
		const current = (this.explicitItems() ?? []).filter((item): item is Purchase => !!item);
		if (current.some((item) => item.id === purchase.id)) return;
		this.explicitItems.set([purchase, ...current]);
	}

	formatKeur(value: number): string {
		return value.toFixed(2).replace('.', ',');
	}
}
