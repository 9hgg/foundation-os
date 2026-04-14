/* eslint-disable @angular-eslint/prefer-inject */
import { AnnualContribution, CategoryEnum, getDailyCostWithOverhead } from '@edf/edf-project-rands/models';
import { AnnualContributionsRepository, ContributorsRepository } from '@edf/edf-project-rands/state';
import { BehaviorType, RepositoryTableComponent } from '@foundation/table/ui';
import { TranslateDirective } from '@foundation/translations/services';
import { CommonModule } from '@angular/common';
import { Attribute, ChangeDetectionStrategy, Component, EventEmitter, Output, inject, input, signal } from '@angular/core';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { ContributorPillComponent } from '../contributor-pill/contributor-pill.component';
import { ContributorCostPillComponent } from '../contributor-cost-pill/contributor-cost-pill.component';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { combineLatest, map, of, switchMap, take } from 'rxjs';
import { v4 as uuidv4 } from 'uuid';

@Component({
	selector: 'lib-annual-contribution-table',
	standalone: true,
	imports: [
		CommonModule,
		TranslateDirective,
		ReactiveFormsModule,
		FormsModule,
		ContributorPillComponent,
		ContributorCostPillComponent,
	],
	templateUrl: './annual-contribution-table.component.html',
	styleUrl: './annual-contribution-table.component.css',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AnnualContributionTableComponent extends RepositoryTableComponent<AnnualContribution, AnnualContributionsRepository> {
	@Output() removeRequested = new EventEmitter<AnnualContribution>();
	@Output() refreshRequested = new EventEmitter<void>();
	@Output() contributorChangeRequested = new EventEmitter<AnnualContribution>();
	@Output() addFallbackRequested = new EventEmitter<void>();
	activityId = input<string | null>(null);

	private _contributorsRepository = inject(ContributorsRepository);
	totalBilledAmountKeur = signal<number | null>(null);
	editingContributionId = signal<string | null>(null);
	editYear = signal<number>(new Date().getFullYear());
	editDays = signal<number>(0);

	constructor(
		private _repository: AnnualContributionsRepository,
		@Attribute('click-behavior') clickBehavior: BehaviorType
	) {
		super(
			_repository,
			{
				orderingBy: { fieldName: 'year', direction: 'desc' },
				alwaysOnFilters: [],
				pageSize: 100,
			},
			clickBehavior
		);

		toObservable(this.explicitItems)
			.pipe(
				switchMap((items) => {
					const contributions = items?.filter((item): item is AnnualContribution => !!item) ?? [];
					if (contributions.length === 0) {
						return of(0);
					}
					const contributorStreams = contributions.map((contribution) => {
						return this._contributorsRepository.store.getObjectById$$$(contribution.contributorId, true).$.pipe(
							map((contributor) => ({
								contribution,
								category: contributor?.category ?? null,
							}))
						);
					});
					return combineLatest(contributorStreams).pipe(
						map((itemsWithCategories) => {
							return itemsWithCategories.reduce((total, item) => {
								const billedAmountKeur = this.getBilledAmountKeur(item.contribution, item.category);
								return billedAmountKeur === null ? total : total + billedAmountKeur;
							}, 0);
						})
					);
				})
			)
			.pipe(takeUntilDestroyed())
			.subscribe((total) => this.totalBilledAmountKeur.set(total));
	}

	private getBilledAmountKeur(contribution: AnnualContribution, category: CategoryEnum | null): number | null {
		if (!category) return null;
		try {
			const dailyBilledAmount = Math.round(getDailyCostWithOverhead(contribution.year, category));
			const billedAmount = contribution.days * dailyBilledAmount;
			return Math.round(billedAmount / 10) / 100;
		} catch {
			return null;
		}
	}

	availableYears(): number[] {
		const items = this.explicitItems();
		const years = (items ?? [])
			.filter((item): item is AnnualContribution => !!item)
			.map((item) => item.year);
		return Array.from(new Set(years)).sort((a, b) => b - a);
	}

	editableYears(): number[] {
		const years = new Set(this.availableYears());
		const currentYear = new Date().getFullYear();
		for (let year = currentYear - 2; year <= currentYear + 5; year += 1) {
			years.add(year);
		}
		return Array.from(years).sort((a, b) => b - a);
	}

	requestRemove(contribution: AnnualContribution) {
		this.removeRequested.emit(contribution);
	}

	startEdit(contribution: AnnualContribution, event?: Event) {
		event?.stopImmediatePropagation();
		this.editingContributionId.set(contribution.id);
		this.editYear.set(contribution.year);
		this.editDays.set(contribution.days);
	}

	cancelEdit(event?: Event) {
		event?.stopImmediatePropagation();
		this.editingContributionId.set(null);
	}

	isEditing(contribution: AnnualContribution): boolean {
		return this.editingContributionId() === contribution.id;
	}

	saveEdit(contribution: AnnualContribution, event?: Event) {
		event?.stopImmediatePropagation();
		const normalizedDays = Number(this.editDays());
		const normalizedYear = Number(this.editYear());
		const updated: AnnualContribution = {
			...contribution,
			year: Number.isFinite(normalizedYear) ? normalizedYear : contribution.year,
			days: Number.isFinite(normalizedDays) ? normalizedDays : contribution.days,
		};

		Object.assign(contribution, updated);
		this._repository.store
			.save(updated)
			.pipe(take(1))
			.subscribe(() => this.refreshRequested.emit());
		this.editingContributionId.set(null);
	}

	addInlineContribution(event?: Event) {
		event?.stopImmediatePropagation();
		const activityId = this.activityId() ?? this.getActivityIdFromItems();
		const contributorId = this.defaultContributorId();
		if (!activityId || !contributorId) {
			this.addFallbackRequested.emit();
			return;
		}

		const payload: AnnualContribution = {
			id: uuidv4(),
			activityId,
			contributorId,
			year: new Date().getFullYear(),
			days: 0,
		};

		this._repository.store
			.postObject$(payload)
			.pipe(take(1))
			.subscribe((response) => {
				const created = response?.result?.data ?? payload;
				this.prependContribution(created);
				this.startEdit(created);
				this.refreshRequested.emit();
			});
	}

	duplicateContribution(contribution: AnnualContribution, event?: Event) {
		event?.stopImmediatePropagation();
		const payload: AnnualContribution = {
			...contribution,
			id: uuidv4(),
			year: contribution.year + 1,
		};
		this._repository.store
			.postObject$(payload)
			.pipe(take(1))
			.subscribe((response) => {
				const created = response?.result?.data ?? payload;
				this.prependContribution(created);
				this.startEdit(created);
				this.refreshRequested.emit();
			});
	}

	requestContributorChange(contribution: AnnualContribution, event?: Event) {
		event?.stopImmediatePropagation();
		this.contributorChangeRequested.emit(contribution);
	}

	private defaultContributorId(): string | null {
		const firstItem = this.explicitItems()?.find((item): item is AnnualContribution => !!item);
		return firstItem?.contributorId ?? null;
	}

	private getActivityIdFromItems(): string | null {
		const firstItem = this.explicitItems()?.find((item): item is AnnualContribution => !!item);
		return firstItem?.activityId ?? null;
	}

	private prependContribution(contribution: AnnualContribution) {
		const current = (this.explicitItems() ?? []).filter((item): item is AnnualContribution => !!item);
		if (current.some((item) => item.id === contribution.id)) return;
		this.explicitItems.set([contribution, ...current]);
	}

	formatKeur(value: number): string {
		return value.toFixed(2).replace('.', ',');
	}
}
