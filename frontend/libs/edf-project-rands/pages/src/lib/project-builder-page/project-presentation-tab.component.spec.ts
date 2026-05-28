import { ProjectPresentationTabComponent } from './project-presentation-tab/project-presentation-tab.component';

function createSignal<T>(initialValue: T) {
	let value = initialValue;
	const signal: any = () => value;
	signal.set = (nextValue: T) => {
		value = nextValue;
	};
	return signal as (() => T) & { set: (value: T) => void };
}

describe('ProjectPresentationTabComponent helper coverage', () => {
	function createComponent() {
		const component = Object.create(ProjectPresentationTabComponent.prototype) as any;
		component._projectCostService = {
			getContributionBilledAmountKeur: vi.fn((contribution: any) => contribution.days),
			getFacilityUsageBilledAmountKeur: vi.fn((usage: any) => usage.cost),
			getPurchaseBilledAmountKeur: vi.fn((purchase: any) => purchase.estimatedCost ?? 0),
		};
		component._adjustedYearlyCostsByActivity = createSignal(new Map([['activity-1', { 2025: 4, 2026: 7 }]]));
		component._facilitiesById = createSignal({ 'facility-1': { name: 'FANDA platform' }, 'facility-2': { name: 'Lab' } });
		component.selectedYear = createSignal(null);
		component.costFollowupData = createSignal({ months: ['2025-01', '2026-04'] });
		component.displayYears = () => [2024, 2025];
		component.fullDisplayYears = () => [2025, 2026];
		component.batchBudgetRows = () => [
			{ label: 'Batch A', totalCostKeur: 15, yearlyCostsKeur: { 2025: 10, 2026: 5 } },
			{ label: 'Batch B', totalCostKeur: 5, yearlyCostsKeur: { 2025: 1, 2026: 4 } },
		];
		component.yearBudgetRows = () => [
			{ year: 2025, totalCostKeur: 11 },
			{ year: 2026, totalCostKeur: 9 },
		];
		component.effortTrackingSlide = () => ({
			year: 2025,
			monthLabels: ['Jan', 'Feb'],
			actualSeries: [1, 2],
			projectedSeries: [2, 4],
			theoreticalSeries: [1, 3],
		});
		component._effortTrackingChartInstance = { setOption: vi.fn(), clear: vi.fn(), resize: vi.fn() };
		component._batchBudgetChartInstance = { setOption: vi.fn(), clear: vi.fn(), resize: vi.fn() };
		component._yearBudgetChartInstance = { setOption: vi.fn(), clear: vi.fn(), resize: vi.fn() };
		component._batchBudgetShareChartInstance = { setOption: vi.fn(), clear: vi.fn(), resize: vi.fn() };
		return component;
	}

	it('handles slide ordering, insertion, and formatting helpers', () => {
		const component = createComponent();
		const baseSlides = [
			{ id: 'title', title: 'Title' },
			{ id: 'body', title: 'Body' },
		] as any;

		expect(component._getStaticSlideDefinition('title')).toEqual(expect.objectContaining({ id: 'title' }));
		expect(() => component._getStaticSlideDefinition('missing')).toThrow('Unknown presentation slide definition');
		expect(component._applyIncludedSlideIds(baseSlides, ['body'])).toEqual([{ id: 'body', title: 'Body' }]);
		expect(component._applyOrderedSlideIds(baseSlides, ['body'])).toEqual([{ id: 'body', title: 'Body' }, { id: 'title', title: 'Title' }]);
		expect(component._insertCustomSlide(baseSlides, { id: 'custom', beforeSlideId: 'body', title: 'Custom' })).toEqual([
			{ id: 'title', title: 'Title' },
			{ id: 'custom', beforeSlideId: 'body', title: 'Custom' },
			{ id: 'body', title: 'Body' },
		]);
		expect(component._insertCustomSlides(baseSlides, [{ id: 'custom-2', label: 'Custom', title: 'Custom 2', afterSlideId: 'body' }])).toEqual([
			{ id: 'title', title: 'Title' },
			{ id: 'body', title: 'Body' },
			expect.objectContaining({ id: 'custom-2', kind: 'custom' }),
		]);
		expect(component._computeOverviewTrend(1, 2)).toBe('up');
		expect(component._computeOverviewTrend(2, 1)).toBe('down');
		expect(component._computeOverviewTrend(2, 2)).toBe('stable');
		expect(component._getAdjustedActivityYearlyCosts('activity-1', [2025, 2026])).toEqual({ 2025: 4, 2026: 7 });
		expect(component._sumYearlyCosts({ 2025: 1.25, 2026: 2.34 })).toBe(3.6);
		expect(component._isFandaUsage({ facilityId: 'facility-1' })).toBe(true);
		expect(component._isFandaUsage({ facilityId: 'facility-2' })).toBe(false);
		expect(component._isLotZeroBatch('L0')).toBe(true);
		expect(component._isLotZeroBatch(undefined, 'Lot 0 transverse')).toBe(true);
		expect(component.formatDate('2025-04-20')).toContain('20');
		expect(component.formatDate('not-a-date')).toBe('not-a-date');
	});

	it('updates chart instances and replaces chart images for printing', () => {
		vi.useFakeTimers();
		const component = createComponent();
		const printRoot = document.createElement('div');
		const host = document.createElement('div');
		host.className = 'chart';
		printRoot.appendChild(host);
		const chartInstance = { getDataURL: vi.fn().mockReturnValue('data:image/png;base64,x') };

		component._updateEffortTrackingChart();
		component._updateBatchBudgetChart();
		component._updateYearBudgetChart();
		component._updateBatchBudgetShareChart();
		component._replacePrintChartWithImage(printRoot, '.chart', chartInstance as any, 'Chart', 'chart-image');
		vi.runAllTimers();

		expect(component._effortTrackingChartInstance.setOption).toHaveBeenCalled();
		expect(component._batchBudgetChartInstance.setOption).toHaveBeenCalled();
		expect(component._yearBudgetChartInstance.setOption).toHaveBeenCalled();
		expect(component._batchBudgetShareChartInstance.setOption).toHaveBeenCalled();
		expect(printRoot.querySelector('img.chart-image')).toBeTruthy();
		expect(component._effortTrackingChartInstance.resize).toHaveBeenCalled();
		vi.useRealTimers();
	});

	it('builds visible rows, names, and cost aggregates', () => {
		const component = createComponent();

		expect(
			component._computeCostByYearKeur(
				[{ contributorId: 'contributor-1', year: 2025, days: 10 }],
				[{ facilityId: 'facility-1', year: 2026, cost: 5 }],
				[{ year: 2026, estimatedCost: 3 }],
				{ 'contributor-1': 'A' },
				[2025, 2026]
			)
		).toEqual({ 2025: 10, 2026: 8 });
		expect(
			component._buildContributorNames(
				[
					{ contributorId: 'contributor-1' },
					{ contributorId: 'contributor-2' },
				],
				{
					'contributor-1': { id: 'contributor-1', firstName: 'Alice', lastName: 'Martin' },
					'contributor-2': { id: 'contributor-2', email: 'bob@example.com', config: { groupManager: true } },
				}
			)
		).toEqual([{ id: 'contributor-1', label: 'Alice Martin' }]);
		expect(component._formatProjectPeriod({ startDate: '2025-01-01', endDate: '2025-12-31' })).toContain('→');
		expect(
			component._buildCustomerNames(
				{ deliverables: [{ id: 'd1', customerId: 'customer-1' }, { id: 'd2', customerId: 'customer-2', hidden: true }] },
				{
					'customer-1': { id: 'customer-1', firstName: 'EDF', lastName: 'Client', unit: 'R&D' },
				}
			)
		).toEqual([{ id: 'customer-1', label: 'EDF Client (R&D)' }]);
		expect(
			component._buildPrincipalDeliverables({
				deliverables: [
					{ id: 'd1', title: 'A', isPrincipal: true, contractualEndDate: '2025-12-31' },
					{ id: 'd2', title: 'B', isPrincipal: false },
				],
			})
		).toEqual([{ id: 'd1', title: 'A', dueDateLabel: expect.stringContaining('Échéance') }]);
		expect(component._buildVisibleProposals([{ id: 'p1', date: new Date('2025-01-01') }, { id: 'p2' }], 2025)).toHaveLength(2);
		expect(component._buildVisibleUpdates([{ id: 'u1', date: new Date('2025-01-01') }, { id: 'u2' }], 2025)).toHaveLength(2);
		expect(component._formatUpdateSourceKind('other')).toBe('Autre');
		expect(component._formatProposalKind('inflexion')).toBe('Inflexion');
		expect(component._computeYearlyCostTrends({ 2025: 1, 2026: 1, 2027: 2 }, [2025, 2026, 2027])).toEqual({
			2025: null,
			2026: 'stable',
			2027: 'up',
		});
		expect(
			component._computeCostKeur(
				[{ contributorId: 'contributor-1', days: 5 }],
				[{ cost: 2 }],
				[{ estimatedCost: 3 }],
				{ 'contributor-1': 'A' }
			)
		).toBe(10);
		expect(component._getContributorDisplayName({ id: 'c1', firstName: 'Alice', lastName: 'Martin' }, 'fallback')).toBe('Alice Martin');
		expect(component._getCustomerDisplayName({ id: 'c1', unit: 'EDF' }, 'fallback')).toBe('EDF');
		expect(component._getEffortTrackingReferenceYear()).toBe(2026);
	});
});
