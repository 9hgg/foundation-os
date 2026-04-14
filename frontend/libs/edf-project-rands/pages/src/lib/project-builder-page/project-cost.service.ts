import { Injectable, inject } from '@angular/core';
import {
	Activity,
	AnnualContribution,
	AnnualFacilityUsage,
	Batch,
	CategoryEnum,
	Project,
	Purchase,
	getDailyCostWithOverhead,
	getOverheadCoefficient,
} from '@edf/edf-project-rands/models';
import { ContributorsRepository } from '@edf/edf-project-rands/state';
import { RequestService } from '@foundation/network/services';
import { combineLatest, map, of, switchMap } from 'rxjs';

export interface ActivityCostRollup {
	activityId: string;
	batchId: string;
	batchPrefix: string;
	batchTitle: string;
	activityPrefix: string;
	activityTitle: string;
	activityLabel: string;
	yearValues: number[];
	totalAllYears: number;
}

export interface BatchCostTable {
	batchId: string;
	batchPrefix: string;
	batchTitle: string;
	rows: ActivityCostRollup[];
	totalByYearValues: number[];
	totalAllYears: number;
}

export interface ProjectCostTable {
	years: number[];
	rows: ActivityCostRollup[];
	totalByYearValues: number[];
	totalAllYears: number;
}

export interface FinancialData {
	contributions: AnnualContribution[];
	facilityUsages: AnnualFacilityUsage[];
	purchases: Purchase[];
	contributorCategories: Record<string, CategoryEnum | null>;
}

export interface CostActivityInput {
	activity: Activity;
	batch: Batch;
}

@Injectable({ providedIn: 'root' })
export class ProjectCostService {
	private _requestService = inject(RequestService);
	private _contributorsRepository = inject(ContributorsRepository);

	loadFinancialDataForActivities$(activityIds: string[]) {
		if (activityIds.length === 0) {
			return of<FinancialData>({
				contributions: [],
				facilityUsages: [],
				purchases: [],
				contributorCategories: {},
			});
		}

		const contributions$ = combineLatest(
			activityIds.map((activityId) =>
				this._requestService
					.getBasic$<{ data: AnnualContribution[] }>('/api/edf/rand/annual-contributions', {
						filters: `activity_id:${activityId}:exact`,
						page_size: 200,
					})
					.pipe(map((response) => response?.result?.data ?? []))
			)
		).pipe(map((lists) => lists.flat()));

		const facilityUsages$ = combineLatest(
			activityIds.map((activityId) =>
				this._requestService
					.getBasic$<{ data: AnnualFacilityUsage[] }>('/api/edf/rand/annual-facility-usages', {
						filters: `activity_id:${activityId}:exact`,
						page_size: 200,
					})
					.pipe(map((response) => response?.result?.data ?? []))
			)
		).pipe(map((lists) => lists.flat()));

		const purchases$ = combineLatest(
			activityIds.map((activityId) =>
				this._requestService
					.getBasic$<{ data: Purchase[] }>('/api/edf/rand/purchases', {
						filters: `activity_id:${activityId}:exact`,
						page_size: 200,
					})
					.pipe(map((response) => response?.result?.data ?? []))
			)
		).pipe(map((lists) => lists.flat()));

		return combineLatest({
			contributions: contributions$,
			facilityUsages: facilityUsages$,
			purchases: purchases$,
		}).pipe(
			switchMap((data) => {
				const contributorIds = Array.from(new Set(data.contributions.map((c) => c.contributorId)));
				return this._loadContributorCategories$(contributorIds).pipe(
					map((contributorCategories) => ({
						...data,
						contributorCategories,
					}))
				);
			})
		);
	}

	buildCostReportData(params: {
		project: Project;
		activities: CostActivityInput[];
		batches: Batch[];
		financialData: FinancialData;
	}) {
		const { project, activities, batches, financialData } = params;
		const { contributions, facilityUsages, purchases, contributorCategories } = financialData;

		const costYears = this._deriveCostYears(project, contributions, facilityUsages, purchases);
		const activityRollups = activities.map((item) =>
			this._buildActivityCostRollup(item, costYears, contributions, facilityUsages, purchases, contributorCategories)
		);

		const batchCostTables = batches.map((batch) => {
			const rows = activityRollups.filter((row) => row.batchId === batch.id);
			const totalByYearValues = costYears.map((_, index) => this._roundKeur(rows.reduce((sum, row) => sum + row.yearValues[index], 0)));
			const totalAllYears = this._roundKeur(totalByYearValues.reduce((sum, value) => sum + value, 0));
			return {
				batchId: batch.id,
				batchPrefix: batch.prefix ?? '',
				batchTitle: batch.title ?? '',
				rows,
				totalByYearValues,
				totalAllYears,
			} satisfies BatchCostTable;
		});

		const projectTotalByYearValues = costYears.map((_, index) =>
			this._roundKeur(activityRollups.reduce((sum, row) => sum + row.yearValues[index], 0))
		);
		const projectCostTable: ProjectCostTable = {
			years: costYears,
			rows: activityRollups,
			totalByYearValues: projectTotalByYearValues,
			totalAllYears: this._roundKeur(projectTotalByYearValues.reduce((sum, value) => sum + value, 0)),
		};

		const rollups = {
			lots: batchCostTables.map((table) => ({
				batchId: table.batchId,
				totalByYear: costYears.reduce(
					(acc, year, index) => {
						acc[year] = table.totalByYearValues[index];
						return acc;
					},
					{} as Record<number, number>
				),
				totalAllYears: table.totalAllYears,
			})),
		};

		return {
			costYears,
			activityCostRollups: activityRollups,
			activityCostByActivityId: activityRollups.reduce(
				(acc, row) => {
					acc[row.activityId] = row;
					return acc;
				},
				{} as Record<string, ActivityCostRollup>
			),
			batchCostTables,
			batchCostTableById: batchCostTables.reduce(
				(acc, table) => {
					acc[table.batchId] = table;
					return acc;
				},
				{} as Record<string, BatchCostTable>
			),
			projectCostTable,
			rollups,
		};
	}

	getContributionBilledAmountKeur(contribution: AnnualContribution, category: CategoryEnum | null): number | null {
		if (!category) return null;
		try {
			const dailyBilledAmount = Math.round(getDailyCostWithOverhead(contribution.year, category));
			const billedAmount = contribution.days * dailyBilledAmount;
			return this._roundKeur(Math.round(billedAmount / 10) / 100);
		} catch {
			return null;
		}
	}

	getFacilityUsageBilledAmountKeur(usage: AnnualFacilityUsage): number | null {
		try {
			const overheadCoefficient = getOverheadCoefficient(usage.year);
			return this._roundKeur(Math.round((usage.cost * overheadCoefficient) / 10) / 100);
		} catch {
			return null;
		}
	}

	getPurchaseBilledAmountKeur(purchase: Purchase): number | null {
		const baseCost = this.getPurchaseBaseCost(purchase);
		if (baseCost === null) return null;
		try {
			const overheadCoefficient = getOverheadCoefficient(purchase.year);
			return this._roundKeur(Math.round((baseCost * overheadCoefficient) / 10) / 100);
		} catch {
			return null;
		}
	}

	getPurchaseBaseCost(purchase: Purchase): number | null {
		if (purchase.estimatedCost !== undefined && purchase.estimatedCost !== null) return purchase.estimatedCost;
		if (purchase.maxEstimatedCost !== undefined && purchase.maxEstimatedCost !== null) return purchase.maxEstimatedCost;
		if (purchase.minEstimatedCost !== undefined && purchase.minEstimatedCost !== null) return purchase.minEstimatedCost;
		return null;
	}

	private _loadContributorCategories$(contributorIds: string[]) {
		if (contributorIds.length === 0) return of<Record<string, CategoryEnum | null>>({});
		return combineLatest(
			contributorIds.map((id) =>
				this._contributorsRepository.store.getObjectByIdPullOnce$$$(id).$.pipe(
					map((contributor) => ({
						id,
						category: contributor?.category ?? null,
					}))
				)
			)
		).pipe(
			map((rows) =>
				rows.reduce(
					(acc, row) => {
						acc[row.id] = row.category;
						return acc;
					},
					{} as Record<string, CategoryEnum | null>
				)
			)
		);
	}

	private _buildActivityCostRollup(
		item: CostActivityInput,
		years: number[],
		contributions: AnnualContribution[],
		facilityUsages: AnnualFacilityUsage[],
		purchases: Purchase[],
		contributorCategories: Record<string, CategoryEnum | null>
	): ActivityCostRollup {
		const yearTotals = new Map<number, number>();
		years.forEach((year) => yearTotals.set(year, 0));

		contributions
			.filter((contribution) => contribution.activityId === item.activity.id)
			.forEach((contribution) => {
				const category = contributorCategories[contribution.contributorId] ?? null;
				const billed = this.getContributionBilledAmountKeur(contribution, category);
				if (billed === null) return;
				this._addYearlyTotal(yearTotals, contribution.year, billed);
			});

		facilityUsages
			.filter((usage) => usage.activityId === item.activity.id)
			.forEach((usage) => {
				const billed = this.getFacilityUsageBilledAmountKeur(usage);
				if (billed === null) return;
				this._addYearlyTotal(yearTotals, usage.year, billed);
			});

		purchases
			.filter((purchase) => purchase.activityId === item.activity.id)
			.forEach((purchase) => {
				const billed = this.getPurchaseBilledAmountKeur(purchase);
				if (billed === null) return;
				this._addYearlyTotal(yearTotals, purchase.year, billed);
			});

		const yearValues = years.map((year) => this._roundKeur(yearTotals.get(year) ?? 0));
		const totalAllYears = this._roundKeur(yearValues.reduce((sum, value) => sum + value, 0));
		const activityPrefix = item.activity.prefix?.trim() || '';
		const activityTitle = item.activity.title?.trim() || '—';
		const batchPrefix = item.batch.prefix?.trim() || '';
		const activityLabel = [batchPrefix && activityPrefix ? `${batchPrefix}.${activityPrefix}` : '', activityTitle].filter(Boolean).join(' — ');

		return {
			activityId: item.activity.id,
			batchId: item.batch.id,
			batchPrefix,
			batchTitle: item.batch.title ?? '',
			activityPrefix,
			activityTitle,
			activityLabel: activityLabel || activityTitle,
			yearValues,
			totalAllYears,
		};
	}

	private _deriveCostYears(
		project: Project,
		contributions: AnnualContribution[],
		facilityUsages: AnnualFacilityUsage[],
		purchases: Purchase[]
	) {
		const projectYears = this._deriveProjectYears(project);
		const dataYears = new Set<number>();
		contributions.forEach((item) => dataYears.add(item.year));
		facilityUsages.forEach((item) => dataYears.add(item.year));
		purchases.forEach((item) => dataYears.add(item.year));

		const sortedDataYears = Array.from(dataYears).sort((a, b) => a - b);
		if (projectYears.length === 0) return sortedDataYears;
		if (sortedDataYears.length === 0) return projectYears;

		const minProjectYear = projectYears[0] ?? sortedDataYears[0];
		const maxProjectYear = projectYears[projectYears.length - 1] ?? sortedDataYears[sortedDataYears.length - 1];
		const minDataYear = sortedDataYears[0] ?? minProjectYear;
		const maxDataYear = sortedDataYears[sortedDataYears.length - 1] ?? maxProjectYear;
		const minYear = Math.min(minProjectYear, minDataYear);
		const maxYear = Math.max(maxProjectYear, maxDataYear);
		return this._buildYearRange(minYear, maxYear);
	}

	private _deriveProjectYears(project: Project): number[] {
		const startYear = this._parseYear(project.startDate);
		const endYear = this._parseYear(project.endDate);
		if (startYear === null && endYear === null) return [];
		const normalizedStart = startYear ?? endYear ?? new Date().getFullYear();
		const normalizedEnd = endYear ?? startYear ?? normalizedStart;
		return this._buildYearRange(Math.min(normalizedStart, normalizedEnd), Math.max(normalizedStart, normalizedEnd));
	}

	private _parseYear(value?: string): number | null {
		if (!value) return null;
		const parsed = new Date(value);
		if (Number.isNaN(parsed.getTime())) return null;
		return parsed.getFullYear();
	}

	private _buildYearRange(startYear: number, endYear: number): number[] {
		const years: number[] = [];
		for (let year = startYear; year <= endYear; year += 1) {
			years.push(year);
		}
		return years;
	}

	private _addYearlyTotal(totals: Map<number, number>, year: number, amountKeur: number) {
		if (!totals.has(year)) return;
		totals.set(year, (totals.get(year) ?? 0) + amountKeur);
	}

	private _roundKeur(value: number): number {
		return Math.round(value * 100) / 100;
	}
}
