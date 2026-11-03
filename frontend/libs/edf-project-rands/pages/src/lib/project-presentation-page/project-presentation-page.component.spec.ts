import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { BehaviorSubject, Observable, of, Subject } from 'rxjs';
import { ContributorsRepository, CustomersRepository } from '@edf/edf-project-rands/state';
import { FilesRepository } from '@foundation/files/state';
import { RequestService } from '@foundation/network/services';
import { ProjectPresentationPageComponent } from './project-presentation-page.component';

function buildSnapshot() {
	return {
		project: { id: 'project-1', startDate: '2025-01-01', endDate: '2026-12-31' },
		catalog: {
			customSlides: [{ id: 'slide-1' }],
			orderedSlideIds: ['title'],
			includedSlideIds: [],
			hiddenSlideIds: ['thank-you'],
			includedActivityIds: ['activity-b2-a2'],
			selectedYears: [2025],
		},
		mainCustomer: { id: 'cust-main', firstName: 'Jane', lastName: 'Doe', unit: 'R&D' },
		sponsorCustomer: { id: 'cust-sponsor', firstName: 'Sam', lastName: 'Sponsor' },
		projectManager: { id: 'pm-1', firstName: 'Grace', lastName: 'Hopper' },
		strategicLead: null,
		costTrackingData: { totalKeur: 42 },
		files: { 'file-1': { id: 'file-1', name: 'Report.pdf' } },
		batches: [
			{
				batch: { id: 'batch-b2', prefix: 'B2' },
				activities: [
					{
						activity: { id: 'activity-b2-a2', prefix: 'A2', title: 'Contributions', batchId: 'batch-b2' },
						deliverables: [{ deliverable: { id: 'deliv-1', title: 'D1' }, customer: { id: 'cust-2', firstName: 'Cust', lastName: 'Two' } }],
						contributions: [{ contribution: { id: 'contrib-a', activityId: 'activity-b2-a2', contributorId: 'contrib-1', year: 2025, days: 5 }, contributor: { id: 'contrib-1', firstName: 'Alice', lastName: 'Martin', category: 'A' } }],
						facilityUsages: [{ facilityUsage: { id: 'fu-1', activityId: 'activity-b2-a2', facilityId: 'fac-1', year: 2025, cost: 3 }, facility: { id: 'fac-1', name: 'Lab' } }],
						purchases: [{ id: 'purch-1', activityId: 'activity-b2-a2', year: 2025, estimatedCost: 2 }],
					},
					{
						activity: { id: 'activity-b2-noprefix', title: 'No Prefix', batchId: 'batch-b2' },
						deliverables: [],
						contributions: [],
						facilityUsages: [],
						purchases: [],
					},
				],
			},
			{
				batch: { id: 'batch-b10', prefix: 'B10' },
				activities: [
					{
						activity: { id: 'activity-b10-a1', prefix: 'A1', title: 'Other batch', batchId: 'batch-b10' },
						deliverables: [],
						contributions: [{ contribution: { id: 'contrib-b', activityId: 'activity-b10-a1', contributorId: 'contrib-2', year: 2026, days: 8 }, contributor: { id: 'contrib-2', firstName: 'Bob', lastName: 'Nolan' } }],
						facilityUsages: [],
						purchases: [{ id: 'purch-2', activityId: 'activity-b10-a1', year: 2026, estimatedCost: 4 }],
					},
				],
			},
		],
	};
}

describe('ProjectPresentationPageComponent', () => {
	let getBasic$: ReturnType<typeof vi.fn>;
	let upsertContributor: ReturnType<typeof vi.fn>;
	let upsertCustomer: ReturnType<typeof vi.fn>;
	let upsertFile: ReturnType<typeof vi.fn>;

	// The snapshot response is read eagerly (toSignal on a field initializer), so getBasic$'s
	// return value must be wired up before TestBed.createComponent runs.
	function buildComponent(params: Record<string, string>, responseSource: Observable<unknown> = of(null)) {
		TestBed.resetTestingModule();
		getBasic$ = vi.fn().mockReturnValue(responseSource);
		upsertContributor = vi.fn();
		upsertCustomer = vi.fn();
		upsertFile = vi.fn();

		TestBed.configureTestingModule({
			imports: [ProjectPresentationPageComponent],
			providers: [
				{ provide: ActivatedRoute, useValue: { paramMap: new BehaviorSubject(convertToParamMap(params)) } },
				{ provide: RequestService, useValue: { getBasic$ } },
				{ provide: ContributorsRepository, useValue: { store: { upsertObjectLocally: upsertContributor } } },
				{ provide: CustomersRepository, useValue: { store: { upsertObjectLocally: upsertCustomer } } },
				{ provide: FilesRepository, useValue: { store: { upsertObjectLocally: upsertFile } } },
			],
		});
		TestBed.overrideComponent(ProjectPresentationPageComponent, { set: { template: '' } });
		const fixture = TestBed.createComponent(ProjectPresentationPageComponent);
		fixture.detectChanges();
		return { component: fixture.componentInstance, fixture };
	}

	afterEach(() => TestBed.resetTestingModule());

	it('does not fetch a snapshot when the route is missing ids', () => {
		const { component } = buildComponent({});

		expect(getBasic$).not.toHaveBeenCalled();
		expect(component.isLoading()).toBe(true);
		expect(component.hasError()).toBe(false);
		expect(component.project()).toBeNull();
	});

	it('fetches the snapshot from the route params and reflects loading then loaded state', () => {
		const response$ = new Subject<unknown>();
		const { component, fixture } = buildComponent({ projectId: 'project-1', presentationId: 'presentation-1' }, response$);

		expect(getBasic$).toHaveBeenCalledWith('/api/edf/rand/projects/project-1/presentations/presentation-1/snapshot');
		expect(component.isLoading()).toBe(true);

		response$.next({ result: buildSnapshot() });
		fixture.detectChanges();

		expect(component.isLoading()).toBe(false);
		expect(component.project()).toEqual(buildSnapshot().project);
	});

	it('reports an error and leaves project data empty', () => {
		const response$ = new Subject<unknown>();
		const { component, fixture } = buildComponent({ projectId: 'project-1', presentationId: 'presentation-1' }, response$);

		response$.next({ error: { title: 'Snapshot failed' } });
		fixture.detectChanges();

		expect(component.hasError()).toBe(true);
		expect(component.isLoading()).toBe(false);
		expect(component.project()).toBeNull();
	});

	it('derives display names, flattened lists, categories, and sorted activities from the snapshot', () => {
		const snapshot = buildSnapshot();
		const { component } = buildComponent({ projectId: 'project-1', presentationId: 'presentation-1' }, of({ result: snapshot }));

		expect(component.mainCustomerDisplayName()).toBe('Jane Doe (R&D)');
		expect(component.sponsorCustomerDisplayName()).toBe('Sam Sponsor');
		expect(component.projectManagerDisplayName()).toBe('Grace Hopper');
		expect(component.strategicLeadDisplayName()).toBe('');

		expect(component.contributions().map((c: any) => c.id)).toEqual(['contrib-a', 'contrib-b']);
		expect(component.purchases().map((p: any) => p.id)).toEqual(['purch-1', 'purch-2']);
		expect(component.facilityUsages().map((f: any) => f.id)).toEqual(['fu-1']);
		expect(component.contributorCategories()).toEqual({ 'contrib-1': 'A', 'contrib-2': null });

		expect(component.detailedActivities().map((activity) => activity.id)).toEqual(['activity-b2-a2', 'activity-b2-noprefix', 'activity-b10-a1']);
		expect(component.detailedActivities()[0].mergedPrefix).toBe('B2.A2');
		expect(component.detailedActivities()[1].mergedPrefix).toBe('B2');

		expect(component.projectYears()).toEqual([2025, 2026]);
		expect(component.resolvedDisplayYears()).toEqual([2025]);

		expect(component.catalogCustomSlides()).toEqual([{ id: 'slide-1' }]);
		expect(component.catalogOrderedSlideIds()).toEqual(['title']);
		expect(component.catalogIncludedSlideIds()).toBeNull();
		expect(component.catalogHiddenSlideIds()).toEqual(['thank-you']);
		expect(component.catalogIncludedActivityIds()).toEqual(['activity-b2-a2']);
		expect(component.catalogSelectedYears()).toEqual([2025]);
		expect(component.costTrackingData()).toEqual({ totalKeur: 42 });
	});

	it('computes project years from the date range, treating missing or inverted dates as empty', () => {
		const missingDates = buildSnapshot();
		(missingDates as any).project = { id: 'project-2' };
		const { component: componentA } = buildComponent({ projectId: 'project-2', presentationId: 'presentation-1' }, of({ result: missingDates }));
		expect(componentA.projectYears()).toEqual([]);

		const inverted = buildSnapshot();
		(inverted as any).project = { id: 'project-3', startDate: '2026-01-01', endDate: '2025-01-01' };
		const { component: componentB } = buildComponent({ projectId: 'project-3', presentationId: 'presentation-1' }, of({ result: inverted }));
		expect(componentB.projectYears()).toEqual([]);
	});

	it('falls back to project years when the catalog has no selected years', () => {
		const snapshot = buildSnapshot();
		snapshot.catalog.selectedYears = [];
		const { component } = buildComponent({ projectId: 'project-1', presentationId: 'presentation-1' }, of({ result: snapshot }));

		expect(component.catalogSelectedYears()).toBeNull();
		expect(component.resolvedDisplayYears()).toEqual(component.projectYears());
	});

	it('sets the budget year from the catalog-selected years once the snapshot loads', () => {
		const currentYear = new Date().getFullYear();

		const pastYears = buildSnapshot();
		pastYears.catalog.selectedYears = [currentYear - 2, currentYear - 1];
		const { component: pastComponent, fixture: pastFixture } = buildComponent({ projectId: 'project-1', presentationId: 'presentation-1' }, of({ result: pastYears }));
		pastFixture.detectChanges();
		expect(pastComponent.budgetYear()).toBe(currentYear - 1);

		const includingCurrent = buildSnapshot();
		includingCurrent.catalog.selectedYears = [currentYear - 1, currentYear];
		const { component: currentComponent, fixture: currentFixture } = buildComponent({ projectId: 'project-1', presentationId: 'presentation-1' }, of({ result: includingCurrent }));
		currentFixture.detectChanges();
		expect(currentComponent.budgetYear()).toBe(currentYear);
	});

	it('seeds the contributor, customer, and file stores from the snapshot so linked entities resolve locally', () => {
		const snapshot = buildSnapshot();
		buildComponent({ projectId: 'project-1', presentationId: 'presentation-1' }, of({ result: snapshot }));

		expect(upsertContributor).toHaveBeenCalledWith(expect.objectContaining({ id: 'contrib-1' }));
		expect(upsertContributor).toHaveBeenCalledWith(expect.objectContaining({ id: 'contrib-2' }));
		expect(upsertCustomer).toHaveBeenCalledWith(expect.objectContaining({ id: 'cust-2' }));
		expect(upsertCustomer).not.toHaveBeenCalledWith(expect.objectContaining({ id: 'cust-main' }));
		expect(upsertFile).toHaveBeenCalledWith(expect.objectContaining({ id: 'file-1' }));
	});
});
