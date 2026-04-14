import { ChangeDetectionStrategy, Component, computed, inject, input, model } from '@angular/core';
import { Purchase } from '@edf/edf-project-rands/models';
import { ActivitiesRepository } from '@edf/edf-project-rands/state';
import { DetailedActivity } from '@edf/edf-project-rands/ui';
import { TranslateDirective } from '@foundation/translations/services';

interface EnrichedPurchase {
	purchase: Purchase;
	activityMergedPrefix: string;
	activityTitle: string;
	activityId: string;
}

@Component({
	selector: 'lib-project-purchases-tab',
	imports: [TranslateDirective],
	templateUrl: './project-purchases-tab.component.html',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProjectPurchasesTabComponent {
	private _activitiesRepository = inject(ActivitiesRepository);

	purchases = input<Purchase[]>([]);
	detailedActivities = input<DetailedActivity[]>([]);

	selectedYear = model<number | null>(null);

	private _activityById = computed(() => {
		return this.detailedActivities().reduce(
			(acc, da) => {
				acc[da.activity.id] = da;
				return acc;
			},
			{} as Record<string, DetailedActivity>
		);
	});

	availableYears = computed(() => {
		const years = [...new Set(this.purchases().map((p) => p.year))].sort((a, b) => a - b);
		return years;
	});

	enrichedPurchases = computed(() => {
		const activityById = this._activityById();
		return this.purchases()
			.map((purchase): EnrichedPurchase => {
				const da = activityById[purchase.activityId];
				return {
					purchase,
					activityMergedPrefix: da?.mergedPrefix ?? '—',
					activityTitle: da?.activityTitle ?? '—',
					activityId: purchase.activityId,
				};
			})
			.sort((a, b) => {
				if (a.purchase.year !== b.purchase.year) return a.purchase.year - b.purchase.year;
				return a.activityMergedPrefix.localeCompare(b.activityMergedPrefix, undefined, { numeric: true, sensitivity: 'base' });
			});
	});

	filteredPurchases = computed(() => {
		const year = this.selectedYear();
		if (year === null) return this.enrichedPurchases();
		return this.enrichedPurchases().filter((ep) => ep.purchase.year === year);
	});

	totalsByYear = computed(() => {
		return this.enrichedPurchases().reduce(
			(acc, ep) => {
				const year = ep.purchase.year;
				acc[year] = (acc[year] ?? 0) + (ep.purchase.estimatedCost ?? 0);
				return acc;
			},
			{} as Record<number, number>
		);
	});

	grandTotal = computed(() => {
		return Object.values(this.totalsByYear()).reduce((sum, v) => sum + v, 0);
	});

	filteredTotal = computed(() => {
		return this.filteredPurchases().reduce((sum, ep) => sum + (ep.purchase.estimatedCost ?? 0), 0);
	});

	goToActivity(activityId: string) {
		this._activitiesRepository.goToActivity(activityId);
	}

	formatKeur(value: number | undefined | null): string {
		if (value === undefined || value === null) return '—';
		return `${(value / 1000).toFixed(1)} k€`;
	}
}
