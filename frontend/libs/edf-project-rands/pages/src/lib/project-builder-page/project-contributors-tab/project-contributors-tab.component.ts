import { ChangeDetectionStrategy, Component, computed, effect, inject, input, model, signal } from '@angular/core';
import { AnnualContribution, Contributor } from '@edf/edf-project-rands/models';
import { ActivitiesRepository, ContributorsRepository } from '@edf/edf-project-rands/state';
import { DetailedActivity } from '@edf/edf-project-rands/ui';
import { TranslateDirective } from '@foundation/translations/services';
import { combineLatest, map } from 'rxjs';

interface ContributorActivityRow {
	activityId: string;
	activityLabel: string;
	activityTitle: string;
	daysByYear: Record<number, number>;
	totalDays: number;
}

interface ContributorYearRow {
	contributorId: string;
	displayName: string;
	email: string | null;
	category: string | null;
	daysByYear: Record<number, number>;
	totalDays: number;
	activities: ContributorActivityRow[];
}

@Component({
	selector: 'lib-project-contributors-tab',
	standalone: true,
	imports: [TranslateDirective],
	templateUrl: './project-contributors-tab.component.html',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProjectContributorsTabComponent {
	private _activitiesRepository = inject(ActivitiesRepository);
	private _contributorsRepository = inject(ContributorsRepository);

	contributions = input<AnnualContribution[]>([]);
	visibleActivityIds = input<string[]>([]);
	detailedActivities = input<DetailedActivity[]>([]);
	selectedGroup = signal<string | null>(null);
	selectedYear = model<number | null>(null);

	private _contributorsById = signal<Record<string, Contributor | null>>({});

	availableGroups = computed(() => {
		const groups = new Set<string>();
		const contributorsById = this._contributorsById();
		for (const contribution of this._groupFilteredContributions()) {
			const group = contributorsById[contribution.contributorId]?.group?.trim();
			if (group) groups.add(group);
		}
		return [...groups].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
	});

	private _activityFilteredContributions = computed(() => {
		const visibleActivityIds = this.visibleActivityIds();
		if (visibleActivityIds.length === 0) return this.contributions();
		const visibleActivityIdsSet = new Set(visibleActivityIds);
		return this.contributions().filter((contribution) => visibleActivityIdsSet.has(contribution.activityId));
	});

	private _groupFilteredContributions = computed(() => {
		const selectedGroup = this.selectedGroup();
		const contributorsById = this._contributorsById();
		if (!selectedGroup) return this._activityFilteredContributions();
		return this._activityFilteredContributions().filter((contribution) => contributorsById[contribution.contributorId]?.group === selectedGroup);
	});

	filteredContributions = computed(() => {
		return this._groupFilteredContributions();
	});

	availableYears = computed(() => {
		return [...new Set(this.filteredContributions().map((contribution) => contribution.year))].sort((a, b) => a - b);
	});

	rows = computed<ContributorYearRow[]>(() => {
		const contributorsById = this._contributorsById();
		const years = this.availableYears();
		const activityById = this.detailedActivities().reduce(
			(acc, activity) => {
				acc[activity.activity.id] = activity;
				return acc;
			},
			{} as Record<string, DetailedActivity>
		);
		const rowsByContributorId = new Map<string, ContributorYearRow>();

		for (const contribution of this.filteredContributions()) {
			const contributor = contributorsById[contribution.contributorId];
			const existing = rowsByContributorId.get(contribution.contributorId);
			if (existing) {
				existing.daysByYear[contribution.year] = (existing.daysByYear[contribution.year] ?? 0) + contribution.days;
				existing.totalDays += contribution.days;
				const existingActivity = existing.activities.find((activity) => activity.activityId === contribution.activityId);
				if (existingActivity) {
					existingActivity.daysByYear[contribution.year] = (existingActivity.daysByYear[contribution.year] ?? 0) + contribution.days;
					existingActivity.totalDays += contribution.days;
				} else {
					existing.activities.push(this._buildActivityRow(contribution.activityId, contribution.year, contribution.days, years, activityById));
					existing.activities.sort((a, b) => a.activityLabel.localeCompare(b.activityLabel, undefined, { numeric: true, sensitivity: 'base' }));
				}
				continue;
			}

			const daysByYear = years.reduce(
				(acc, year) => {
					acc[year] = 0;
					return acc;
				},
				{} as Record<number, number>
			);
			daysByYear[contribution.year] = contribution.days;

			rowsByContributorId.set(contribution.contributorId, {
				contributorId: contribution.contributorId,
				displayName: this._getContributorDisplayName(contributor, contribution.contributorId),
				email: contributor?.email ?? null,
				category: contributor?.category ?? null,
				daysByYear,
				totalDays: contribution.days,
				activities: [this._buildActivityRow(contribution.activityId, contribution.year, contribution.days, years, activityById)],
			});
		}

		const selectedYear = this.selectedYear();
		const allRows = [...rowsByContributorId.values()].sort((a, b) => a.displayName.localeCompare(b.displayName, undefined, { sensitivity: 'base' }));
		if (selectedYear === null) return allRows;

		return allRows
			.filter((row) => (row.daysByYear[selectedYear] ?? 0) > 0)
			.map((row) => ({
				...row,
				activities: row.activities.filter((activity) => (activity.daysByYear[selectedYear] ?? 0) > 0),
			}));
	});

	totalsByYear = computed(() => {
		return this.filteredContributions().reduce(
			(acc, contribution) => {
				acc[contribution.year] = (acc[contribution.year] ?? 0) + contribution.days;
				return acc;
			},
			{} as Record<number, number>
		);
	});

	grandTotalDays = computed(() => {
		return this.filteredContributions().reduce((sum, contribution) => sum + contribution.days, 0);
	});

	constructor() {
		effect((onCleanup) => {
			const contributorIds = [...new Set(this._activityFilteredContributions().map((contribution) => contribution.contributorId).filter((id) => !!id))];
			if (contributorIds.length === 0) {
				this._contributorsById.set({});
				return;
			}

			const subscription = combineLatest(
				contributorIds.map((contributorId) =>
					this._contributorsRepository.store.getObjectByIdPullOnce$$$(contributorId).$.pipe(
						map((contributor) => ({
							contributorId,
							contributor,
						}))
					)
				)
			).subscribe((items) => {
				this._contributorsById.set(
					items.reduce(
						(acc, item) => {
							acc[item.contributorId] = item.contributor;
							return acc;
						},
						{} as Record<string, Contributor | null>
					)
				);
			});

			onCleanup(() => subscription.unsubscribe());
		});

		effect(() => {
			const selectedGroup = this.selectedGroup();
			if (!selectedGroup) return;
			if (this.availableGroups().includes(selectedGroup)) return;
			this.selectedGroup.set(null);
		});

		effect(() => {
			const selectedYear = this.selectedYear();
			if (selectedYear === null) return;
			const years = this.availableYears();
			if (years.length === 0) return;
			if (years.includes(selectedYear)) return;
			this.selectedYear.set(null);
		});
	}

	goToContributor(contributorId: string) {
		this._contributorsRepository.goToContributor(contributorId);
	}

	goToActivity(activityId: string) {
		this._activitiesRepository.goToActivity(activityId);
	}

	formatDays(days: number | null | undefined) {
		if (days === null || days === undefined) return '—';
		const rounded = Math.round(days * 10) / 10;
		return Number.isInteger(rounded) ? `${rounded}` : rounded.toFixed(1);
	}

	private _getContributorDisplayName(contributor: Contributor | null | undefined, fallbackId: string) {
		if (!contributor) return fallbackId;
		const fullName = `${contributor.firstName ?? ''} ${contributor.lastName ?? ''}`.trim();
		if (fullName) return fullName;
		if (contributor.email) return contributor.email;
		return contributor.id || fallbackId;
	}

	private _buildActivityRow(
		activityId: string,
		year: number,
		days: number,
		years: number[],
		activityById: Record<string, DetailedActivity>
	): ContributorActivityRow {
		const activity = activityById[activityId];
		const daysByYear = years.reduce(
			(acc, currentYear) => {
				acc[currentYear] = 0;
				return acc;
			},
			{} as Record<number, number>
		);
		daysByYear[year] = days;

		return {
			activityId,
			activityLabel: activity?.mergedPrefix || '—',
			activityTitle: activity?.activityTitle || activityId,
			daysByYear,
			totalDays: days,
		};
	}
}
