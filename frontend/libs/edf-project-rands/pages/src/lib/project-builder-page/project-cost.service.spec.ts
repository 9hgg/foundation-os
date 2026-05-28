import { firstValueFrom, of } from 'rxjs';
import { CategoryEnum } from '@edf/edf-project-rands/models';
import { ProjectCostService } from './project-cost.service';

describe('ProjectCostService', () => {
	function createService() {
		const service = Object.create(ProjectCostService.prototype) as ProjectCostService & any;
		service._requestService = {
			getBasic$: vi.fn(),
		};
		service._contributorsRepository = {
			store: {
				getObjectByIdPullOnce$$$: vi.fn((id: string) => ({ $: of({ id, category: id === 'contributor-1' ? CategoryEnum.A : CategoryEnum.C }) })),
			},
		};
		return service;
	}

	it('returns an empty financial payload when there are no activities', async () => {
		const service = createService();

		await expect(firstValueFrom(service.loadFinancialDataForActivities$([]))).resolves.toEqual({
			contributions: [],
			facilityUsages: [],
			purchases: [],
			contributorCategories: {},
		});
	});

	it('loads contributions, facility usages, purchases, and contributor categories', async () => {
		const service = createService();
		service._requestService.getBasic$.mockImplementation((url: string, params: any) => {
			const activityId = String(params.filters).split(':')[1];
			if (url.includes('annual-contributions')) {
				return of({ result: { data: [{ id: `contribution-${activityId}`, activityId, contributorId: 'contributor-1', year: 2025, days: 2 }] } });
			}
			if (url.includes('annual-facility-usages')) {
				return of({ result: { data: [{ id: `usage-${activityId}`, activityId, facilityId: 'facility-1', year: 2025, cost: 100 }] } });
			}
			return of({ result: { data: [{ id: `purchase-${activityId}`, activityId, title: 'Purchase', year: 2025, estimatedCost: 50 }] } });
		});

		const result = await firstValueFrom(service.loadFinancialDataForActivities$(['activity-1', 'activity-2']));

		expect(result.contributions).toHaveLength(2);
		expect(result.facilityUsages).toHaveLength(2);
		expect(result.purchases).toHaveLength(2);
		expect(result.contributorCategories).toEqual({ 'contributor-1': CategoryEnum.A });
		expect(service._requestService.getBasic$).toHaveBeenCalled();
	});

	it('builds cost report data for batches, activities, and project totals', () => {
		const service = createService();
		const result = service.buildCostReportData({
			project: {
				id: 'project-1',
				startDate: '2025-01-01',
				endDate: '2026-12-31',
				config: {},
			} as any,
			activities: [
				{
					activity: { id: 'activity-1', batchId: 'batch-1', prefix: 'A1', title: 'Alpha' },
					batch: { id: 'batch-1', prefix: 'B1', title: 'Batch 1' },
				},
				{
					activity: { id: 'activity-2', batchId: 'batch-1', prefix: 'A2', title: 'Beta' },
					batch: { id: 'batch-1', prefix: 'B1', title: 'Batch 1' },
				},
			] as any,
			batches: [{ id: 'batch-1', prefix: 'B1', title: 'Batch 1' }] as any,
			financialData: {
				contributions: [
					{ id: 'contribution-1', activityId: 'activity-1', contributorId: 'contributor-1', year: 2025, days: 1 },
				] as any,
				facilityUsages: [
					{ id: 'usage-1', activityId: 'activity-1', facilityId: 'facility-1', year: 2026, cost: 200 },
				] as any,
				purchases: [
					{ id: 'purchase-1', activityId: 'activity-2', title: 'Purchase', year: 2026, estimatedCost: 100 },
				] as any,
				contributorCategories: { 'contributor-1': CategoryEnum.A },
			},
		});

		expect(result.costYears).toEqual([2025, 2026]);
		expect(result.activityCostRollups).toHaveLength(2);
		expect(result.batchCostTables[0]?.rows).toHaveLength(2);
		expect(result.projectCostTable.totalAllYears).toBeGreaterThan(0);
		expect(result.rollups.lots[0]?.batchId).toBe('batch-1');
	});

	it('computes billed amounts and base costs with the expected fallbacks', () => {
		const service = createService();

		expect(service.getContributionBilledAmountKeur({ year: 2025, days: 2, contributorId: 'contributor-1' } as any, CategoryEnum.A)).toBeGreaterThan(0);
		expect(service.getContributionBilledAmountKeur({ year: 1900, days: 2, contributorId: 'contributor-1' } as any, CategoryEnum.A)).toBeNull();
		expect(service.getContributionBilledAmountKeur({ year: 2025, days: 2, contributorId: 'contributor-1' } as any, null)).toBeNull();

		expect(service.getFacilityUsageBilledAmountKeur({ year: 2025, cost: 100 } as any)).toBeGreaterThan(0);
		expect(service.getFacilityUsageBilledAmountKeur({ year: 1900, cost: 100 } as any)).toBeNull();

		expect(service.getPurchaseBaseCost({ estimatedCost: 10, maxEstimatedCost: 20, minEstimatedCost: 5 } as any)).toBe(10);
		expect(service.getPurchaseBaseCost({ maxEstimatedCost: 20, minEstimatedCost: 5 } as any)).toBe(20);
		expect(service.getPurchaseBaseCost({ minEstimatedCost: 5 } as any)).toBe(5);
		expect(service.getPurchaseBaseCost({} as any)).toBeNull();
		expect(service.getPurchaseBilledAmountKeur({ year: 2025, estimatedCost: 100 } as any)).toBeGreaterThan(0);
		expect(service.getPurchaseBilledAmountKeur({ year: 1900, estimatedCost: 100 } as any)).toBeNull();
	});
});
