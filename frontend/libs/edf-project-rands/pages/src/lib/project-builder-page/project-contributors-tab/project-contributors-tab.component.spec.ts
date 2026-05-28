import { TestBed } from '@angular/core/testing';
import { ActivitiesRepository, ContributorsRepository } from '@edf/edf-project-rands/state';
import { ProjectContributorsTabComponent } from './project-contributors-tab.component';

function createSignal<T>(initialValue: T) {
	let value = initialValue;
	const signal: any = () => value;
	signal.set = (nextValue: T) => {
		value = nextValue;
	};
	return signal as (() => T) & { set: (value: T) => void };
}

describe('ProjectContributorsTabComponent', () => {
	let activitiesRepository: { goToActivity: ReturnType<typeof vi.fn> };
	let contributorsRepository: { goToContributor: ReturnType<typeof vi.fn>; store: { getObjectByIdPullOnce$$$: ReturnType<typeof vi.fn> } };

	beforeEach(() => {
		activitiesRepository = {
			goToActivity: vi.fn(),
		};
		contributorsRepository = {
			goToContributor: vi.fn(),
			store: {
				getObjectByIdPullOnce$$$: vi.fn(() => ({ $: { subscribe: () => ({ unsubscribe() {} }) } })),
			},
		};
		TestBed.configureTestingModule({
			providers: [
				{ provide: ActivitiesRepository, useValue: activitiesRepository },
				{ provide: ContributorsRepository, useValue: contributorsRepository },
			],
		});
	});

	function createComponent() {
		const component = TestBed.runInInjectionContext(() => new ProjectContributorsTabComponent()) as any;
		component.contributions = createSignal([
			{ contributorId: 'contributor-1', activityId: 'activity-1', year: 2025, days: 2.5 },
			{ contributorId: 'contributor-1', activityId: 'activity-2', year: 2026, days: 1 },
			{ contributorId: 'contributor-2', activityId: 'activity-2', year: 2025, days: 4 },
		]);
		component.visibleActivityIds = createSignal<string[]>([]);
		component.detailedActivities = createSignal([
			{ activity: { id: 'activity-1' }, mergedPrefix: '1.1', activityTitle: 'Alpha' },
			{ activity: { id: 'activity-2' }, mergedPrefix: '2.3', activityTitle: 'Beta' },
		]);
		component._contributorsById.set({
			'contributor-1': { id: 'contributor-1', firstName: 'Alice', lastName: 'Martin', email: 'alice@example.com', category: 'A', group: 'Core' },
			'contributor-2': { id: 'contributor-2', email: 'bob@example.com', category: 'B', group: 'Ops' },
		});
		return component;
	}

	it('groups contributions by contributor, activity, year, and group', () => {
		const component = createComponent();

		expect(component.availableGroups()).toEqual(['Core', 'Ops']);
		expect(component.filteredContributions()).toHaveLength(3);
		expect(component.availableYears()).toEqual([2025, 2026]);
		expect(component.totalsByYear()).toEqual({ 2025: 6.5, 2026: 1 });
		expect(component.grandTotalDays()).toBe(7.5);

		const rows = component.rows();
		expect(rows).toHaveLength(2);
		expect(rows[0]).toEqual(
			expect.objectContaining({
				displayName: 'Alice Martin',
				totalDays: 3.5,
			})
		);
		expect(rows[0].activities[0]).toEqual(expect.objectContaining({ activityLabel: '1.1', totalDays: 2.5 }));

		const groupedComponent = createComponent();
		groupedComponent.selectedGroup.set('Ops');
		expect(groupedComponent.filteredContributions()).toHaveLength(1);
		expect(groupedComponent.rows()).toEqual([
			expect.objectContaining({
				contributorId: 'contributor-2',
				totalDays: 4,
			}),
		]);

		const yearFilteredComponent = createComponent();
		yearFilteredComponent.selectedYear.set(2025);
		expect(yearFilteredComponent.rows()[0].activities).toHaveLength(1);
	});

	it('navigates and formats contributor values', () => {
		const component = createComponent();

		component.goToContributor('contributor-1');
		component.goToActivity('activity-2');

		expect(contributorsRepository.goToContributor).toHaveBeenCalledWith('contributor-1');
		expect(activitiesRepository.goToActivity).toHaveBeenCalledWith('activity-2');
		expect(component.formatDays(3)).toBe('3');
		expect(component.formatDays(3.25)).toBe('3.3');
		expect(component.formatDays(null)).toBe('—');
		expect(component._getContributorDisplayName(null, 'fallback-id')).toBe('fallback-id');
		expect(component._getContributorDisplayName({ id: 'x', email: 'x@example.com' }, 'fallback-id')).toBe('x@example.com');
		expect(component._buildActivityRow('missing-activity', 2027, 2, [2026, 2027], {})).toEqual({
			activityId: 'missing-activity',
			activityLabel: '—',
			activityTitle: 'missing-activity',
			daysByYear: { 2026: 0, 2027: 2 },
			totalDays: 2,
		});
	});
});
