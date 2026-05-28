import { of } from 'rxjs';
import { ProjectTransferService } from './project-transfer.service';

vi.mock('uuid', () => {
	let index = 0;
	return {
		v4: () => `uuid-${++index}`,
	};
});

describe('ProjectTransferService', () => {
	function createRepositoryStore() {
		return {
			postObject$: vi.fn((payload: any) => of({ result: { data: payload } })),
		};
	}

	function createService() {
		const service = Object.create(ProjectTransferService.prototype) as ProjectTransferService & any;
		service._requestService = {
			getBasic$: vi.fn(),
			getObject$: vi.fn(),
		};
		service._projectsRepository = { store: createRepositoryStore() };
		service._customersRepository = { store: createRepositoryStore() };
		service._contributorsRepository = { store: createRepositoryStore() };
		service._facilitiesRepository = { store: createRepositoryStore() };
		service._batchesRepository = { store: createRepositoryStore() };
		service._activitiesRepository = { store: createRepositoryStore() };
		service._deliverablesRepository = { store: createRepositoryStore() };
		service._activityDeliverablesRepository = { store: createRepositoryStore() };
		service._annualContributionsRepository = { store: createRepositoryStore() };
		service._annualFacilityUsagesRepository = { store: createRepositoryStore() };
		service._purchasesRepository = { store: createRepositoryStore() };
		service._entityEndpointByKind = {
			project: '/api/edf/rand/projects',
			customer: '/api/edf/rand/customers',
			contributor: '/api/edf/rand/contributors',
			facility: '/api/edf/rand/facilities',
			batch: '/api/edf/rand/batches',
			activity: '/api/edf/rand/activities',
			deliverable: '/api/edf/rand/deliverables',
			activity_deliverable: '/api/edf/rand/activity-deliverables',
			annual_contribution: '/api/edf/rand/annual-contributions',
			annual_facility_usage: '/api/edf/rand/annual-facility-usages',
			purchase: '/api/edf/rand/purchases',
		};
		return service;
	}

	it('exports a project bundle by traversing related resources', async () => {
		const service = createService();
		service._requestService.getObject$.mockImplementation((url: string) => {
			if (url.endsWith('/project-1')) {
				return of({ result: { data: { id: 'project-1', code: 'PRJ', config: { mainCustomerId: 'customer-1', projectManagerContributorId: 'contributor-1' } } } });
			}
			if (url.endsWith('/deliverable-1')) {
				return of({ result: { data: { id: 'deliverable-1', customerId: 'customer-2' } } });
			}
			if (url.endsWith('/customer-1')) return of({ result: { data: { id: 'customer-1' } } });
			if (url.endsWith('/customer-2')) return of({ result: { data: { id: 'customer-2' } } });
			if (url.endsWith('/contributor-1')) return of({ result: { data: { id: 'contributor-1' } } });
			if (url.endsWith('/facility-1')) return of({ result: { data: { id: 'facility-1' } } });
			return of({ error: { title: 'missing' } });
		});
		service._requestService.getBasic$.mockImplementation((url: string) => {
			if (url.includes('/batches')) return of({ result: { data: [{ id: 'batch-1', projectId: 'project-1' }], hasNext: false } });
			if (url.includes('/activities')) return of({ result: { data: [{ id: 'activity-1', batchId: 'batch-1' }], hasNext: false } });
			if (url.includes('activity-deliverables')) return of({ result: { data: [{ id: 'link-1', activityId: 'activity-1', deliverableId: 'deliverable-1' }], hasNext: false } });
			if (url.includes('annual-contributions')) return of({ result: { data: [{ id: 'contribution-1', activityId: 'activity-1', contributorId: 'contributor-1', year: 2025, days: 2 }], hasNext: false } });
			if (url.includes('annual-facility-usages')) return of({ result: { data: [{ id: 'usage-1', activityId: 'activity-1', facilityId: 'facility-1', year: 2025, cost: 100 }], hasNext: false } });
			if (url.includes('/purchases')) return of({ result: { data: [{ id: 'purchase-1', activityId: 'activity-1', year: 2025, title: 'Purchase' }], hasNext: false } });
			return of({ result: { data: [], hasNext: false } });
		});

		const bundle = await service.exportProjectBundle('project-1');

		expect(bundle.sourceProjectId).toBe('project-1');
		expect(bundle.data.batches).toHaveLength(1);
		expect(bundle.data.activities).toHaveLength(1);
		expect(bundle.data.deliverables).toHaveLength(1);
		expect(bundle.data.customers).toHaveLength(2);
	});

	it('downloads a project bundle as a JSON file', () => {
		const service = createService();
		const anchor = { href: '', download: '', click: vi.fn() };
		const createObjectURL = vi.spyOn(window.URL, 'createObjectURL').mockReturnValue('blob:bundle');
		const revokeObjectURL = vi.spyOn(window.URL, 'revokeObjectURL').mockImplementation(() => {});
		const createElement = vi.spyOn(document, 'createElement').mockReturnValue(anchor as any);

		service.downloadProjectBundle({
			schema: 'edf-project-rand/project-transfer',
			version: 1,
			exportedAt: '2025-01-01T00:00:00.000Z',
			sourceProjectId: 'project-1',
			data: { project: { id: 'project-1', code: 'PRJ' } } as any,
		});

		expect(anchor.download).toBe('project-export-PRJ.json');
		expect(anchor.click).toHaveBeenCalled();

		createObjectURL.mockRestore();
		revokeObjectURL.mockRestore();
		createElement.mockRestore();
	});

	it('imports a bundle and remaps linked ids', async () => {
		const service = createService();

		const result = await service.importProjectBundle({
			schema: 'edf-project-rand/project-transfer',
			version: 1,
			sourceProjectId: 'project-1',
			data: {
				project: { id: 'project-1', code: 'PRJ', config: { mainCustomerId: 'customer-1', projectManagerContributorId: 'contributor-1' } },
				customers: [{ id: 'customer-1' }],
				contributors: [{ id: 'contributor-1' }],
				facilities: [{ id: 'facility-1' }],
				batches: [{ id: 'batch-1', projectId: 'project-1' }],
				activities: [{ id: 'activity-1', batchId: 'batch-1' }],
				deliverables: [{ id: 'deliverable-1', customerId: 'customer-1', isPrincipal: false }],
				activityDeliverables: [{ id: 'link-1', activityId: 'activity-1', deliverableId: 'deliverable-1' }],
				annualContributions: [{ id: 'contribution-1', activityId: 'activity-1', contributorId: 'contributor-1', year: 2025, days: 2 }],
				annualFacilityUsages: [{ id: 'usage-1', activityId: 'activity-1', facilityId: 'facility-1', year: 2025, cost: 100 }],
				purchases: [{ id: 'purchase-1', activityId: 'activity-1', year: 2025, title: 'Purchase' }],
			},
		});

		expect(result.projectId).toBe('uuid-4');
		expect(service._projectsRepository.store.postObject$).toHaveBeenCalledWith(expect.objectContaining({ id: 'uuid-4' }));
		expect(service._batchesRepository.store.postObject$).toHaveBeenCalledWith(expect.objectContaining({ projectId: 'uuid-4' }));
		expect(service._activitiesRepository.store.postObject$).toHaveBeenCalledWith(expect.objectContaining({ batchId: 'uuid-5' }));
		expect(service._deliverablesRepository.store.postObject$).toHaveBeenCalledWith(expect.objectContaining({ customerId: 'uuid-1' }));
	});

	it('supports pagination, id deduplication, and parsing helpers', async () => {
		const service = createService();
		service._requestService.getBasic$
			.mockReturnValueOnce(of({ result: { data: [{ id: 'a' }], hasNext: true } }))
			.mockReturnValueOnce(of({ result: { data: [{ id: 'b' }], hasNext: false } }));
		service._requestService.getObject$
			.mockReturnValueOnce(of({ result: { data: { id: 'customer-1' } } }))
			.mockReturnValueOnce(of({ error: { title: 'missing' } }));

		const listed = await service._listResources('customer', ['kind:main:exact']);
		const fetched = await service._fetchResourcesByIds('customer', ['customer-1', 'customer-1', '', null, 'missing']);

		expect(listed).toEqual([{ id: 'a' }, { id: 'b' }]);
		expect(fetched).toEqual([{ id: 'customer-1' }]);
		expect(service._toUniqueIds([' a ', 'a', null, ''])).toEqual(['a']);
		expect(service._mapOptionalId('source', new Map([['source', 'mapped']]))).toBe('mapped');
		expect(() => service._mapIdOrThrow('missing', new Map(), 'customer')).toThrow('Missing customer mapping');
		expect(service._stripResourceMeta({ id: 'x', timeCreated: '1', timeUpdated: '2' } as any)).toEqual({ id: 'x' });
		expect(service._parseBundle({ schema: 'edf-project-rand/project-transfer', version: 1, data: { project: { id: 'project-1' } } }).sourceProjectId).toBe('project-1');
		expect(() => service._parseBundle(null)).toThrow('expected a JSON object');
		expect(() => service._parseBundle({ schema: 'other', version: 1, data: { project: { id: 'project-1' } } })).toThrow('Unsupported project import schema');
		expect(() => service._parseBundle({ schema: 'edf-project-rand/project-transfer', version: 2, data: { project: { id: 'project-1' } } })).toThrow('Unsupported project import version');
		expect(() => service._parseBundle({ schema: 'edf-project-rand/project-transfer', version: 1, data: {} })).toThrow('missing project data');
	});

	it('throws when result helpers receive invalid responses', async () => {
		const service = createService();

		expect(() => service._requireResult({ error: { description: 'boom' } }, 'context')).toThrow('boom');
		expect(() => service._requireSimpleData({ error: { title: 'bad' } } as any, 'context')).toThrow('bad');
		await expect(service._createResource({ id: 'x' }, () => of({ result: { data: undefined } } as any), 'context')).rejects.toThrow('context');
	});
});
