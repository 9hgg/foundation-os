import { TestBed } from '@angular/core/testing';
import { ActivitiesRepository } from '@edf/edf-project-rands/state';
import { ProjectPurchasesTabComponent } from './project-purchases-tab.component';

function createSignal<T>(initialValue: T) {
	let value = initialValue;
	const signal: any = () => value;
	signal.set = (nextValue: T) => {
		value = nextValue;
	};
	return signal as (() => T) & { set: (value: T) => void };
}

describe('ProjectPurchasesTabComponent', () => {
	let activitiesRepository: { goToActivity: ReturnType<typeof vi.fn> };

	beforeEach(() => {
		activitiesRepository = {
			goToActivity: vi.fn(),
		};
		TestBed.configureTestingModule({
			providers: [{ provide: ActivitiesRepository, useValue: activitiesRepository }],
		});
	});

	function createComponent() {
		const component = TestBed.runInInjectionContext(() => new ProjectPurchasesTabComponent()) as any;
		component.purchases = createSignal([
			{ id: 'purchase-1', activityId: 'activity-2', year: 2026, estimatedCost: 1000 },
			{ id: 'purchase-2', activityId: 'activity-1', year: 2025, estimatedCost: 2000 },
			{ id: 'purchase-3', activityId: 'activity-1', year: 2025 },
		]);
		component.detailedActivities = createSignal([
			{ activity: { id: 'activity-1' }, mergedPrefix: '1.2', activityTitle: 'Alpha' },
			{ activity: { id: 'activity-2' }, mergedPrefix: '2.1', activityTitle: 'Beta' },
		]);
		return component;
	}

	it('builds enriched purchases, yearly totals, and filtered totals', () => {
		const component = createComponent();

		expect(component.availableYears()).toEqual([2025, 2026]);
		expect(component.enrichedPurchases().map((entry: any) => entry.activityMergedPrefix)).toEqual(['1.2', '1.2', '2.1']);
		expect(component.filteredPurchases()).toHaveLength(3);
		expect(component.totalsByYear()).toEqual({ 2025: 2000, 2026: 1000 });
		expect(component.grandTotal()).toBe(3000);
		expect(component.filteredTotal()).toBe(3000);

		component.selectedYear.set(2025);
		expect(component.filteredPurchases()).toHaveLength(2);
		expect(component.filteredTotal()).toBe(2000);
	});

	it('navigates to activities and formats values', () => {
		const component = createComponent();

		component.goToActivity('activity-1');

		expect(activitiesRepository.goToActivity).toHaveBeenCalledWith('activity-1');
		expect(component.formatKeur(2500)).toBe('2.5 k€');
		expect(component.formatKeur(null)).toBe('—');
	});
});
