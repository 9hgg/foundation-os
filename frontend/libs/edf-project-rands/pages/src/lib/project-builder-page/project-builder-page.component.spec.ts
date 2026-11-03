import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, ParamMap, Router } from '@angular/router';
import { Subject, of } from 'rxjs';
import { Activity, ActivityDeliverable, Batch, Deliverable, Project } from '@edf/edf-project-rands/models';
import { ActivitiesModals, BatchesModals, DeliverablesModals } from '@edf/edf-project-rands/modals';
import { ActivitiesRepository, ActivityDeliverablesRepository, BatchesRepository, ContributorsRepository, CustomersRepository, DeliverablesRepository, ProjectsRepository } from '@edf/edf-project-rands/state';
import { NotificationService } from '@foundation/notification';
import { MetaDataService } from '@foundation/utils';
import { ProjectCostService } from './project-cost.service';
import { ProjectsBuilderPageComponent } from './project-builder-page.component';

// Several of the component's constructor `effect()`s are only flushed by Angular's own scheduler,
// which TestBed exposes for tests via this private-but-stable API -- the same pattern already used
// in this repo's `code-list-page.component.spec.ts`.
function flushEffects() {
	(TestBed as any).flushEffects?.();
}

describe('ProjectsBuilderPageComponent', () => {
	let projectsRepository: { store: { getObjectByIdPullOnce$$$: ReturnType<typeof vi.fn>; applyPatch: ReturnType<typeof vi.fn> } };
	let customersRepository: { store: { getObjectByIdPullOnce$$$: ReturnType<typeof vi.fn> } };
	let contributorsRepository: { store: { getObjectByIdPullOnce$$$: ReturnType<typeof vi.fn> } };
	let batchesRepository: { store: { getObjects$: ReturnType<typeof vi.fn>; postObject$: ReturnType<typeof vi.fn> }; goToBatch: ReturnType<typeof vi.fn> };
	let batchesModals: { openBatchCreateDialog: ReturnType<typeof vi.fn> };
	let activitiesRepository: { store: { getObjects$: ReturnType<typeof vi.fn>; postObject$: ReturnType<typeof vi.fn>; save: ReturnType<typeof vi.fn> }; goToActivity: ReturnType<typeof vi.fn> };
	let activitiesModals: { openActivityCreateDialog: ReturnType<typeof vi.fn> };
	let deliverablesModals: { openDeliverableCreateDialog: ReturnType<typeof vi.fn> };
	let activityDeliverablesRepository: { store: { getObjects$: ReturnType<typeof vi.fn>; postObject$: ReturnType<typeof vi.fn> } };
	let deliverablesRepository: { store: { getObjectByIdPullOnce$$$: ReturnType<typeof vi.fn>; postObject$: ReturnType<typeof vi.fn> } };
	let projectCostService: { loadFinancialDataForActivities$: ReturnType<typeof vi.fn>; buildCostReportData: ReturnType<typeof vi.fn> };
	let notificationService: { snackSuccess: ReturnType<typeof vi.fn>; success: ReturnType<typeof vi.fn> };
	let metaDataService: { setTitle: ReturnType<typeof vi.fn>; resetTitle: ReturnType<typeof vi.fn> };
	let router: { navigate: ReturnType<typeof vi.fn> };
	let queryParamMap$: Subject<ParamMap>;

	// Every repository defaults to an empty/`null` answer so the component's field initializers
	// (batches$$$, activitiesByBatch$$$, ...) have something safe to subscribe to the moment the
	// class is constructed. Individual tests reconfigure a mock's return value any time before the
	// action that reads it -- it's the same live `vi.fn()` object throughout.
	const buildComponent = (initialQueryParams: Record<string, string> = {}) => {
		projectsRepository = { store: { getObjectByIdPullOnce$$$: vi.fn().mockReturnValue({ $: of(null) }), applyPatch: vi.fn() } };
		customersRepository = { store: { getObjectByIdPullOnce$$$: vi.fn().mockReturnValue({ $: of(null) }) } };
		contributorsRepository = { store: { getObjectByIdPullOnce$$$: vi.fn().mockReturnValue({ $: of(null) }) } };
		batchesRepository = { store: { getObjects$: vi.fn().mockReturnValue(of({ data: [] })), postObject$: vi.fn() }, goToBatch: vi.fn() };
		batchesModals = { openBatchCreateDialog: vi.fn() };
		activitiesRepository = { store: { getObjects$: vi.fn().mockReturnValue(of({ data: [] })), postObject$: vi.fn(), save: vi.fn() }, goToActivity: vi.fn() };
		activitiesModals = { openActivityCreateDialog: vi.fn() };
		deliverablesModals = { openDeliverableCreateDialog: vi.fn() };
		activityDeliverablesRepository = { store: { getObjects$: vi.fn().mockReturnValue(of({ data: [] })), postObject$: vi.fn() } };
		deliverablesRepository = { store: { getObjectByIdPullOnce$$$: vi.fn().mockReturnValue({ $: of(null) }), postObject$: vi.fn() } };
		projectCostService = {
			loadFinancialDataForActivities$: vi.fn().mockReturnValue(of({ contributions: [], facilityUsages: [], purchases: [], contributorCategories: {} })),
			buildCostReportData: vi.fn().mockReturnValue({}),
		};
		notificationService = { snackSuccess: vi.fn(), success: vi.fn() };
		metaDataService = { setTitle: vi.fn(), resetTitle: vi.fn() };
		router = { navigate: vi.fn() };
		queryParamMap$ = new Subject<ParamMap>();

		TestBed.configureTestingModule({
			providers: [
				{ provide: ProjectsRepository, useValue: projectsRepository },
				{ provide: CustomersRepository, useValue: customersRepository },
				{ provide: ContributorsRepository, useValue: contributorsRepository },
				{ provide: BatchesRepository, useValue: batchesRepository },
				{ provide: BatchesModals, useValue: batchesModals },
				{ provide: ActivitiesRepository, useValue: activitiesRepository },
				{ provide: ActivitiesModals, useValue: activitiesModals },
				{ provide: DeliverablesModals, useValue: deliverablesModals },
				{ provide: ActivityDeliverablesRepository, useValue: activityDeliverablesRepository },
				{ provide: DeliverablesRepository, useValue: deliverablesRepository },
				{ provide: ProjectCostService, useValue: projectCostService },
				{ provide: NotificationService, useValue: notificationService },
				{ provide: MetaDataService, useValue: metaDataService },
				{ provide: Router, useValue: router },
				{
					provide: ActivatedRoute,
					useValue: {
						snapshot: { queryParamMap: convertToParamMap(initialQueryParams) },
						queryParamMap: queryParamMap$,
					},
				},
			],
		});

		return TestBed.runInInjectionContext(() => new ProjectsBuilderPageComponent());
	};

	afterEach(() => TestBed.resetTestingModule());

	describe('pulling the project by id', () => {
		it('does not fetch anything while no id is set', () => {
			const component = buildComponent();

			expect(component.patchableProject.patchedItem()).toBeNull();
			expect(projectsRepository.store.getObjectByIdPullOnce$$$).not.toHaveBeenCalled();
		});

		it('fetches and exposes the project once an id is set', () => {
			const project: Project = { id: 'project-1', name: 'Solar Roof', code: 'SR', config: {} };
			const component = buildComponent();
			projectsRepository.store.getObjectByIdPullOnce$$$.mockReturnValue({ $: of(project) });

			component.projectId.set('project-1');
			flushEffects();

			expect(projectsRepository.store.getObjectByIdPullOnce$$$).toHaveBeenCalledWith('project-1');
			expect(component.patchableProject.patchedItem()).toEqual(project);
		});
	});

	describe('reading the initial tab/filter state from the route', () => {
		it('defaults to the details tab and the no-zero batch filter with no query params', () => {
			const component = buildComponent();

			expect(component.activeTab()).toBe('details');
			expect(component.selectedBatchId()).toBe('no-zero');
			expect(component.selectedPurchasesYear()).toBeNull();
			expect(component.selectedPresentationCatalogId()).toBeNull();
		});

		it('seeds every piece of state from the initial query params', () => {
			const component = buildComponent({
				activeTab: 'achats',
				selectedBatchId: 'all',
				achatsYear: '2024',
				contributeursYear: '2023',
				presentationYear: '2022',
				presentationCatalogId: 'catalog-1',
				presentationActivityId: 'activity-1',
				presentationUpdateId: 'update-1',
			});

			expect(component.activeTab()).toBe('achats');
			expect(component.selectedBatchId()).toBeNull();
			expect(component.selectedPurchasesYear()).toBe(2024);
			expect(component.selectedContributorsYear()).toBe(2023);
			expect(component.selectedPresentationYear()).toBe(2022);
			expect(component.selectedPresentationCatalogId()).toBe('catalog-1');
			expect(component.targetPresentationActivityId()).toBe('activity-1');
			expect(component.targetPresentationUpdateId()).toBe('update-1');
		});

		it('falls back to the details tab for an unrecognized activeTab value', () => {
			const component = buildComponent({ activeTab: 'not-a-real-tab' });

			expect(component.activeTab()).toBe('details');
		});

		it('keeps a specific batch id as-is, only "all" maps to no filter', () => {
			const component = buildComponent({ selectedBatchId: 'batch-7' });

			expect(component.selectedBatchId()).toBe('batch-7');
		});

		it('keeps reacting to query param changes after construction', () => {
			const component = buildComponent();

			queryParamMap$.next(convertToParamMap({ activeTab: 'reports', achatsYear: '2030' }));

			expect(component.activeTab()).toBe('reports');
			expect(component.selectedPurchasesYear()).toBe(2030);
		});
	});

	describe('keeping the url in sync with the builder state', () => {
		it('navigates with the active tab and serialized filters, defaulting the batch filter to "all"', () => {
			const component = buildComponent();
			router.navigate.mockClear();

			component.activeTab.set('presentation');
			component.selectedBatchId.set(null);
			component.selectedPurchasesYear.set(2025);
			flushEffects();

			expect(router.navigate).toHaveBeenCalledWith(
				[],
				expect.objectContaining({
					queryParams: expect.objectContaining({ activeTab: 'presentation', selectedBatchId: 'all', achatsYear: '2025' }),
					replaceUrl: true,
					queryParamsHandling: 'merge',
				})
			);
		});

		it('keeps a specific batch id in the url as-is', () => {
			const component = buildComponent();
			router.navigate.mockClear();

			component.selectedBatchId.set('batch-3');
			flushEffects();

			expect(router.navigate).toHaveBeenLastCalledWith([], expect.objectContaining({ queryParams: expect.objectContaining({ selectedBatchId: 'batch-3' }) }));
		});
	});

	describe('dropping a selected batch that no longer exists', () => {
		it('resets to null once the batches list no longer contains it', () => {
			const component = buildComponent();
			component.batches.set([{ id: 'batch-1', title: 'B1', projectId: 'p' } as Batch]);
			component.selectedBatchId.set('batch-1');
			flushEffects();
			expect(component.selectedBatchId()).toBe('batch-1');

			component.batches.set([{ id: 'batch-2', title: 'B2', projectId: 'p' } as Batch]);
			flushEffects();

			expect(component.selectedBatchId()).toBeNull();
		});

		it('leaves the "no-zero" and null (all) filters alone even when batches change', () => {
			const component = buildComponent();
			component.batches.set([{ id: 'batch-1', title: 'B1', projectId: 'p' } as Batch]);

			component.selectedBatchId.set('no-zero');
			flushEffects();
			expect(component.selectedBatchId()).toBe('no-zero');

			component.selectedBatchId.set(null);
			flushEffects();
			expect(component.selectedBatchId()).toBeNull();
		});
	});

	describe('filtering activities by the selected batch', () => {
		const batchZero = { id: 'batch-0', prefix: '0', title: 'Lot 0', projectId: 'p' } as Batch;
		const batchOne = { id: 'batch-1', prefix: '1', title: 'Lot 1', projectId: 'p' } as Batch;
		const detailedActivities = [
			{ id: 'act-0', batch: batchZero, activity: { id: 'act-0' } as Activity, deliverables: [], mergedPrefix: '0.1', mergedPrefixSort: '', batchPrefix: '0', activityPrefix: '1', activityTitle: 'Zero', batchPrefixSort: '', activityPrefixSort: '' },
			{ id: 'act-1', batch: batchOne, activity: { id: 'act-1' } as Activity, deliverables: [], mergedPrefix: '1.1', mergedPrefixSort: '', batchPrefix: '1', activityPrefix: '1', activityTitle: 'One', batchPrefixSort: '', activityPrefixSort: '' },
		];

		it('selectedBatch resolves the current batch or null when unmatched', () => {
			const component = buildComponent();
			component.batches.set([batchZero, batchOne]);

			component.selectedBatchId.set('batch-1');
			expect(component.selectedBatch()).toEqual(batchOne);

			component.selectedBatchId.set('missing');
			expect(component.selectedBatch()).toBeNull();
		});

		it('the "no-zero" filter drops the L0/0 batch to avoid confusion with "no batch"', () => {
			const component = buildComponent();
			(component as any)._unfilteredDetailedActivities.set(detailedActivities);
			component.selectedBatchId.set('no-zero');

			expect(component.displayedDetailedActivities()).toEqual([detailedActivities[1]]);
		});

		it('a specific batch id filters to just that batch', () => {
			const component = buildComponent();
			(component as any)._unfilteredDetailedActivities.set(detailedActivities);
			component.selectedBatchId.set('batch-0');

			expect(component.displayedDetailedActivities()).toEqual([detailedActivities[0]]);
			expect(component.displayedActivityIds()).toEqual(['act-0']);
		});

		it('a null (all) filter keeps everything, including the L0 batch', () => {
			const component = buildComponent();
			(component as any)._unfilteredDetailedActivities.set(detailedActivities);
			component.selectedBatchId.set(null);

			expect(component.displayedDetailedActivities()).toEqual(detailedActivities);
			expect(component.allDetailedActivities()).toEqual(detailedActivities);
		});
	});

	describe('projectPresentationYears', () => {
		it('is empty when the project has no dates yet', () => {
			const component = buildComponent();

			expect(component.projectPresentationYears()).toEqual([]);
		});

		it('is empty when the end date precedes the start date', () => {
			const component = buildComponent();
			projectsRepository.store.getObjectByIdPullOnce$$$.mockReturnValue({ $: of({ id: 'p1', name: 'P', code: 'P1', startDate: '2024-01-01', endDate: '2020-01-01', config: {} } as Project) });
			component.projectId.set('p1');
			flushEffects();

			expect(component.projectPresentationYears()).toEqual([]);
		});

		it('lists every year the project spans, inclusive', () => {
			const component = buildComponent();
			projectsRepository.store.getObjectByIdPullOnce$$$.mockReturnValue({ $: of({ id: 'p1', name: 'P', code: 'P1', startDate: '2020-11-01', endDate: '2022-02-01', config: {} } as Project) });
			component.projectId.set('p1');
			flushEffects();

			expect(component.projectPresentationYears()).toEqual([2020, 2021, 2022]);
		});
	});

	describe('resolving linked customer and contributor display names', () => {
		it('resolves and formats main/sponsor customers and pm/strategic-lead contributors from the project config', () => {
			const component = buildComponent();
			const project = {
				id: 'p1',
				name: 'P',
				code: 'P1',
				config: { mainCustomerId: 'cust-main', sponsorCustomerId: 'cust-sponsor', projectManagerContributorId: 'contrib-pm', strategicLeadContributorId: 'contrib-lead' },
			} as Project;
			projectsRepository.store.getObjectByIdPullOnce$$$.mockReturnValue({ $: of(project) });
			customersRepository.store.getObjectByIdPullOnce$$$.mockImplementation((id: string) => ({
				$: of(id === 'cust-main' ? { id, firstName: 'Ada', lastName: 'Lovelace', unit: 'R&D' } : { id, firstName: 'Bob', lastName: 'Sponsor' }),
			}));
			contributorsRepository.store.getObjectByIdPullOnce$$$.mockImplementation((id: string) => ({
				$: of(id === 'contrib-pm' ? { id, firstName: 'Grace', lastName: 'Hopper' } : { id, firstName: 'Rita', lastName: 'Levi' }),
			}));

			component.projectId.set('p1');
			flushEffects();

			expect(component.mainCustomerDisplayName()).toBe('Ada Lovelace (R&D)');
			expect(component.sponsorCustomerDisplayName()).toBe('Bob Sponsor');
			expect(component.projectManagerDisplayName()).toBe('Grace Hopper');
			expect(component.strategicLeadDisplayName()).toBe('Rita Levi');
		});

		it('clears every name back to empty when the project has no linked people', () => {
			const component = buildComponent();
			projectsRepository.store.getObjectByIdPullOnce$$$.mockReturnValue({ $: of({ id: 'p1', name: 'P', code: 'P1', config: {} } as Project) });

			component.projectId.set('p1');
			flushEffects();

			expect(component.mainCustomerDisplayName()).toBe('');
			expect(component.sponsorCustomerDisplayName()).toBe('');
			expect(component.projectManagerDisplayName()).toBe('');
			expect(component.strategicLeadDisplayName()).toBe('');
		});
	});

	describe('the browser tab title', () => {
		it('prefers the project name, formatted as "Projet · <name>"', () => {
			const component = buildComponent();
			projectsRepository.store.getObjectByIdPullOnce$$$.mockReturnValue({ $: of({ id: 'p1', name: 'Solar Roof', code: 'SR', config: {} } as Project) });

			component.projectId.set('p1');
			flushEffects();

			expect(metaDataService.setTitle).toHaveBeenCalledWith('Projet · Solar Roof');
		});

		it('falls back to the project code when it has no name', () => {
			const component = buildComponent();
			projectsRepository.store.getObjectByIdPullOnce$$$.mockReturnValue({ $: of({ id: 'p1', name: '', code: 'SR', config: {} } as Project) });

			component.projectId.set('p1');
			flushEffects();

			expect(metaDataService.setTitle).toHaveBeenCalledWith('Projet · SR');
		});
	});

	describe('assembling the full project data set', () => {
		it('resolves batches, detailed activities with merged prefixes, financial figures, and the report payload end to end', () => {
			vi.useFakeTimers();
			try {
				const component = buildComponent();
				const project = {
					id: 'p1',
					name: 'Solar Roof',
					code: 'SR',
					config: { extraProperties: { note: { key: 'noteKey', content: 'noteVal' } } },
				} as Project;
				const batch = { id: 'batch-1', title: 'Lot 1', prefix: '1', projectId: 'p1' } as Batch;
				const activity = { id: 'activity-1', title: 'Study', prefix: '1', batchId: 'batch-1', priority: 1, isCorporate: false, isConfirmed: false, tags: [] } as Activity;
				const activityDeliverable = { id: 'ad-1', activityId: 'activity-1', deliverableId: 'deliverable-1' } as ActivityDeliverable;
				const deliverable = { id: 'deliverable-1', title: 'Report', isPrincipal: true, customerId: 'cust-deliverable' } as Deliverable;

				projectsRepository.store.getObjectByIdPullOnce$$$.mockReturnValue({ $: of(project) });
				batchesRepository.store.getObjects$.mockReturnValue(of({ data: [batch] }));
				activitiesRepository.store.getObjects$.mockReturnValue(of({ data: [activity] }));
				activityDeliverablesRepository.store.getObjects$.mockReturnValue(of({ data: [activityDeliverable] }));
				deliverablesRepository.store.getObjectByIdPullOnce$$$.mockReturnValue({ $: of(deliverable) });
				customersRepository.store.getObjectByIdPullOnce$$$.mockReturnValue({ $: of({ id: 'cust-deliverable', unit: 'R&D Unit' }) });
				projectCostService.loadFinancialDataForActivities$.mockReturnValue(
					of({ contributions: [{ id: 'c1' }], facilityUsages: [{ id: 'f1' }], purchases: [{ id: 'pur1' }], contributorCategories: { 'contrib-pm': 'A' } })
				);
				projectCostService.buildCostReportData.mockReturnValue({ table: { years: [2024] } });

				component.projectId.set('p1');
				flushEffects();
				vi.runAllTimers();

				expect(component.batches()).toEqual([batch]);
				expect(component.purchases()).toEqual([{ id: 'pur1' }]);
				expect(component.contributions()).toEqual([{ id: 'c1' }]);
				expect(component.facilityUsages()).toEqual([{ id: 'f1' }]);
				expect(component.contributorCategories()).toEqual({ 'contrib-pm': 'A' });

				const activities = component.allDetailedActivities();
				expect(activities).toHaveLength(1);
				expect(activities[0]).toEqual(expect.objectContaining({ mergedPrefix: '1.1', activityTitle: 'Study' }));
				expect(activities[0].deliverables[0]).toEqual(expect.objectContaining({ id: 'deliverable-1', customerUnit: 'R&D Unit' }));

				expect(projectCostService.buildCostReportData).toHaveBeenCalledWith(expect.objectContaining({ project: expect.objectContaining({ id: 'p1' }), batches: [batch] }));
				expect(component.availableData()).toEqual(expect.objectContaining({ table: { years: [2024] }, noteKey: 'noteVal' }));
			} finally {
				vi.useRealTimers();
			}
		});
	});

	describe('creating a deliverable and linking it to an activity', () => {
		const activity = { id: 'activity-1', batchId: 'batch-1', priority: 1, isCorporate: false, isConfirmed: false, tags: [] } as Activity;

		it('posts the new deliverable, links it to the activity, and notifies on success', () => {
			const component = buildComponent();
			deliverablesModals.openDeliverableCreateDialog.mockReturnValue({
				closed: of({ title: 'Report', description: 'Desc', customerId: 'cust-1', startDate: '2024-01-01', endDate: '2024-02-01', isPrincipal: true }),
			});
			deliverablesRepository.store.postObject$.mockReturnValue(of({ result: { data: { id: 'deliverable-9' } } }));
			activityDeliverablesRepository.store.postObject$.mockReturnValue(of({ result: { data: { id: 'link-1' } } }));

			component.addDeliverableToActivity(activity);

			expect(deliverablesRepository.store.postObject$).toHaveBeenCalledWith(expect.objectContaining({ title: 'Report', customerId: 'cust-1', isPrincipal: true, hidden: false }));
			expect(activityDeliverablesRepository.store.postObject$).toHaveBeenCalledWith(expect.objectContaining({ activityId: 'activity-1', deliverableId: 'deliverable-9' }));
			expect(notificationService.snackSuccess).toHaveBeenCalledWith('Deliverable created and linked to activity successfully.');
		});

		it('does nothing when the picker is dismissed', () => {
			const component = buildComponent();
			deliverablesModals.openDeliverableCreateDialog.mockReturnValue({ closed: of(undefined) });

			component.addDeliverableToActivity(activity);

			expect(deliverablesRepository.store.postObject$).not.toHaveBeenCalled();
		});

		it('does not link anything when the deliverable post yields no id', () => {
			const component = buildComponent();
			deliverablesModals.openDeliverableCreateDialog.mockReturnValue({ closed: of({ title: 'Report', isPrincipal: false }) });
			deliverablesRepository.store.postObject$.mockReturnValue(of({ result: { data: {} } }));

			component.addDeliverableToActivity(activity);

			expect(activityDeliverablesRepository.store.postObject$).not.toHaveBeenCalled();
			expect(notificationService.snackSuccess).not.toHaveBeenCalled();
		});
	});

	describe('adding a batch', () => {
		it('does nothing without a project loaded', () => {
			const component = buildComponent();

			component.addBatch();

			expect(batchesModals.openBatchCreateDialog).not.toHaveBeenCalled();
		});

		it('opens the create dialog for the current project and posts the result', () => {
			const component = buildComponent();
			const project = { id: 'p1', name: 'P', code: 'P1', config: {} } as Project;
			projectsRepository.store.getObjectByIdPullOnce$$$.mockReturnValue({ $: of(project) });
			component.projectId.set('p1');
			flushEffects();

			batchesModals.openBatchCreateDialog.mockReturnValue({ closed: of({ title: 'Lot 2', prefix: '2', description: 'd', projectId: 'p1' }) });
			batchesRepository.store.postObject$.mockReturnValue(of({ result: { data: { id: 'batch-9' } } }));

			component.addBatch();

			expect(batchesModals.openBatchCreateDialog).toHaveBeenCalledWith({ projectId: 'p1' });
			expect(batchesRepository.store.postObject$).toHaveBeenCalledWith(expect.objectContaining({ title: 'Lot 2', prefix: '2', projectId: 'p1' }));
			expect(notificationService.snackSuccess).toHaveBeenCalledWith('Batch created successfully.');
		});
	});

	describe('adding an activity', () => {
		it('uses no batch when the filter is "no-zero", and notifies via .success on save', () => {
			const component = buildComponent();
			component.selectedBatchId.set('no-zero');
			activitiesModals.openActivityCreateDialog.mockReturnValue({ closed: of({ title: 'Study', batchId: null, priority: 1, isCorporate: false, isConfirmed: false, tags: [] }) });
			activitiesRepository.store.postObject$.mockReturnValue(of({ result: { data: { id: 'activity-9' } } }));

			component.addActivity();

			expect(activitiesModals.openActivityCreateDialog).toHaveBeenCalledWith(expect.objectContaining({ batchId: null }));
			expect(notificationService.success).toHaveBeenCalledWith('Activity created successfully.', undefined, { hasBackdrop: false });
		});

		it('passes the currently selected batch id through when one is chosen, and posts nothing when the dialog is dismissed', () => {
			const component = buildComponent();
			component.selectedBatchId.set('batch-3');
			activitiesModals.openActivityCreateDialog.mockReturnValue({ closed: of(undefined) });

			component.addActivity();

			expect(activitiesModals.openActivityCreateDialog).toHaveBeenCalledWith(expect.objectContaining({ batchId: 'batch-3' }));
			expect(activitiesRepository.store.postObject$).not.toHaveBeenCalled();
		});
	});

	describe('adding an activity directly under a batch', () => {
		it('saves the activity and notifies via .snackSuccess', () => {
			const component = buildComponent();
			const batch = { id: 'batch-1', title: 'Lot 1', projectId: 'p1' } as Batch;
			activitiesModals.openActivityCreateDialog.mockReturnValue({ closed: of({ title: 'Study', batchId: 'batch-1', priority: 1, isCorporate: false, isConfirmed: false, tags: [] }) });
			activitiesRepository.store.save.mockReturnValue(of({ result: { data: { id: 'activity-9' } } }));

			component.addActivityForBatch(batch);

			expect(activitiesModals.openActivityCreateDialog).toHaveBeenCalledWith({ batchId: 'batch-1' });
			expect(activitiesRepository.store.save).toHaveBeenCalledWith(expect.objectContaining({ batchId: 'batch-1', title: 'Study' }));
			expect(notificationService.snackSuccess).toHaveBeenCalledWith('Activity created successfully.');
		});
	});

	describe('navigating from the detailed activities table', () => {
		it('goes to the activity or batch builder depending on the clicked column', () => {
			const component = buildComponent();
			const item = { activity: { id: 'activity-1' }, batch: { id: 'batch-1' } } as any;

			component.goToBuilder({ column: 'activity', item });
			expect(activitiesRepository.goToActivity).toHaveBeenCalledWith('activity-1');

			component.goToBuilder({ column: 'batch', item });
			expect(batchesRepository.goToBatch).toHaveBeenCalledWith('batch-1');
		});
	});

	describe('scrolling to a presentation slide', () => {
		it('delegates to whichever presentation tab matches the active tab', () => {
			const component = buildComponent();
			const scrollToSlide = vi.fn();
			(component as any)._projectPresentationTab = () => ({ scrollToSlide });
			component.activeTab.set('presentation');

			component.scrollToPresentationActivity('activity-1');

			expect(scrollToSlide).toHaveBeenCalledWith('activity-1');
		});

		it('does nothing outside a presentation tab', () => {
			const component = buildComponent();
			const scrollToSlide = vi.fn();
			(component as any)._projectPresentationTab = () => ({ scrollToSlide });
			component.activeTab.set('details');

			component.scrollToPresentationActivity('activity-1');

			expect(scrollToSlide).not.toHaveBeenCalled();
		});
	});
});
