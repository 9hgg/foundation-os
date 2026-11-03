import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { BehaviorSubject, of } from 'rxjs';
import { NotificationService } from '@foundation/notification';
import { RequestService } from '@foundation/network/services';
import { CustomersModals } from '@edf/edf-project-rands/modals';
import { Activity, ActivityDeliverable, Batch, Customer, Deliverable, Project } from '@edf/edf-project-rands/models';
import { ActivitiesRepository, BatchesRepository, CustomersRepository, DeliverablesRepository, ProjectsRepository } from '@edf/edf-project-rands/state';
import { DeliverableBuilderPageComponent } from './deliverable-builder-page.component';

describe('DeliverableBuilderPageComponent', () => {
	let getDeliverableById$$$: ReturnType<typeof vi.fn>;
	let saveDeliverable: ReturnType<typeof vi.fn>;
	let getBasic$: ReturnType<typeof vi.fn>;
	let getActivityById$$$: ReturnType<typeof vi.fn>;
	let getBatchById$$$: ReturnType<typeof vi.fn>;
	let getProjectById$$$: ReturnType<typeof vi.fn>;
	let getCustomerByIdPullOnce$$$: ReturnType<typeof vi.fn>;
	let openCustomerSelectDialog: ReturnType<typeof vi.fn>;

	// The deliverableId param and the whole deliverable -> activity -> batch -> project / customer
	// resolution chain run synchronously off these mocks during construction, so everything has to
	// be configured before buildComponent() runs.
	const buildComponent = (
		params: Record<string, string> = {},
		deliverable: Deliverable | null = null,
		options: {
			activityDeliverables?: ActivityDeliverable[];
			activity?: Activity | null;
			batch?: Batch | null;
			project?: Project | null;
			customer?: Customer | null;
			selectDialogResult?: { customers: Customer[] } | undefined;
		} = {}
	) => {
		getDeliverableById$$$ = vi.fn().mockReturnValue({ $: of(deliverable) });
		saveDeliverable = vi.fn();
		getBasic$ = vi.fn().mockReturnValue(of({ result: { data: options.activityDeliverables ?? [] } }));
		getActivityById$$$ = vi.fn().mockReturnValue({ $: of(options.activity ?? null) });
		getBatchById$$$ = vi.fn().mockReturnValue({ $: of(options.batch ?? null) });
		getProjectById$$$ = vi.fn().mockReturnValue({ $: of(options.project ?? null) });
		getCustomerByIdPullOnce$$$ = vi.fn().mockReturnValue({ $: of(options.customer ?? null) });
		openCustomerSelectDialog = vi.fn().mockReturnValue({ closed: of(options.selectDialogResult) });
		const paramMap$ = new BehaviorSubject(convertToParamMap(params));

		TestBed.configureTestingModule({
			imports: [DeliverableBuilderPageComponent],
			providers: [
				{ provide: NotificationService, useValue: {} },
				{ provide: DeliverablesRepository, useValue: { store: { getObjectByIdPullOnce$$$: getDeliverableById$$$, save: saveDeliverable } } },
				{ provide: ActivitiesRepository, useValue: { store: { getObjectById$$$: getActivityById$$$ } } },
				{ provide: BatchesRepository, useValue: { store: { getObjectById$$$: getBatchById$$$ } } },
				{ provide: ProjectsRepository, useValue: { store: { getObjectById$$$: getProjectById$$$ } } },
				{ provide: CustomersRepository, useValue: { store: { getObjectByIdPullOnce$$$: getCustomerByIdPullOnce$$$ } } },
				{ provide: CustomersModals, useValue: { openCustomerSelectDialog } },
				{ provide: RequestService, useValue: { getBasic$ } },
				{ provide: ActivatedRoute, useValue: { paramMap: paramMap$ } },
			],
		});
		// Skip mounting the real template (translate directive, router link, lib-quill-textarea,
		// lib-customer-pill) -- only the class logic is under test here.
		TestBed.overrideComponent(DeliverableBuilderPageComponent, { set: { template: '' } });
		const fixture = TestBed.createComponent(DeliverableBuilderPageComponent);
		fixture.detectChanges();
		return { component: fixture.componentInstance, fixture, paramMap$ };
	};

	afterEach(() => TestBed.resetTestingModule());

	it('stays empty when opened without a deliverableId', () => {
		const { component } = buildComponent();

		expect(component.deliverable$$$.value).toBeNull();
		expect(component.project()).toBeNull();
		expect(component.selectedCustomer()).toBeNull();
		expect(getBasic$).not.toHaveBeenCalled();
		expect(getCustomerByIdPullOnce$$$).not.toHaveBeenCalled();
	});

	it('loads the deliverable named by the route, with no linked activity', () => {
		const deliverable: Deliverable = { id: 'deliverable-1', title: 'D', isPrincipal: false };
		const { component } = buildComponent({ deliverableId: 'deliverable-1' }, deliverable);

		expect(getDeliverableById$$$).toHaveBeenCalledWith('deliverable-1');
		expect(component.deliverable$$$.value).toEqual(deliverable);
		expect(getBasic$).toHaveBeenCalledWith('/api/edf/rand/activity-deliverables', { filters: 'deliverable_id:deliverable-1:exact', page_size: 1 });
		expect(component.project()).toBeNull();
		expect(getActivityById$$$).not.toHaveBeenCalled();
	});

	it('resolves the full activity -> batch -> project chain', () => {
		const deliverable: Deliverable = { id: 'deliverable-1', title: 'D', isPrincipal: false };
		const activity: Activity = { id: 'activity-1', batchId: 'batch-1' } as Activity;
		const batch: Batch = { id: 'batch-1', title: 'Batch', projectId: 'project-1' };
		const project: Project = { id: 'project-1', name: 'Project 1' } as Project;
		const { component } = buildComponent(
			{ deliverableId: 'deliverable-1' },
			deliverable,
			{ activityDeliverables: [{ id: 'ad-1', activityId: 'activity-1', deliverableId: 'deliverable-1' }], activity, batch, project }
		);

		expect(getActivityById$$$).toHaveBeenCalledWith('activity-1', true);
		expect(getBatchById$$$).toHaveBeenCalledWith('batch-1', true);
		expect(getProjectById$$$).toHaveBeenCalledWith('project-1', true);
		expect(component.project()).toEqual(project);
	});

	it('stops the chain at a batch with no linked project', () => {
		const deliverable: Deliverable = { id: 'deliverable-1', title: 'D', isPrincipal: false };
		const activity: Activity = { id: 'activity-1', batchId: 'batch-1' } as Activity;
		const batch: Batch = { id: 'batch-1', title: 'Batch', projectId: '' };
		const { component } = buildComponent(
			{ deliverableId: 'deliverable-1' },
			deliverable,
			{ activityDeliverables: [{ id: 'ad-1', activityId: 'activity-1', deliverableId: 'deliverable-1' }], activity, batch }
		);

		expect(component.project()).toBeNull();
		expect(getProjectById$$$).not.toHaveBeenCalled();
	});

	it('resolves the linked customer when the deliverable has a customerId', () => {
		const deliverable: Deliverable = { id: 'deliverable-1', title: 'D', isPrincipal: false, customerId: 'customer-1' };
		const customer: Customer = { id: 'customer-1', firstName: 'Ada', lastName: 'Lovelace' };
		const { component } = buildComponent({ deliverableId: 'deliverable-1' }, deliverable, { customer });

		expect(getCustomerByIdPullOnce$$$).toHaveBeenCalledWith('customer-1');
		expect(component.selectedCustomer()).toEqual(customer);
	});

	it('does not resolve a customer when the deliverable has none', () => {
		const deliverable: Deliverable = { id: 'deliverable-1', title: 'D', isPrincipal: false };
		const { component } = buildComponent({ deliverableId: 'deliverable-1' }, deliverable);

		expect(component.selectedCustomer()).toBeNull();
		expect(getCustomerByIdPullOnce$$$).not.toHaveBeenCalled();
	});

	describe('simple field updates', () => {
		const deliverable: Deliverable = { id: 'deliverable-1', title: 'Old', isPrincipal: false, hidden: false };

		it('updateTitle, updateDescription, updateIsPrincipal and updateHidden patch their fields and save', () => {
			const { component } = buildComponent({ deliverableId: 'deliverable-1' }, deliverable);

			component.updateTitle('New title');
			component.updateDescription('New desc');
			component.updateIsPrincipal(true);
			component.updateHidden(true);

			expect(saveDeliverable).toHaveBeenNthCalledWith(1, expect.objectContaining({ title: 'New title' }));
			expect(saveDeliverable).toHaveBeenNthCalledWith(2, expect.objectContaining({ description: 'New desc' }));
			expect(saveDeliverable).toHaveBeenNthCalledWith(3, expect.objectContaining({ isPrincipal: true }));
			expect(saveDeliverable).toHaveBeenNthCalledWith(4, expect.objectContaining({ hidden: true }));
		});

		it('updateDates saves both dates, defaulting blanks to undefined', () => {
			const { component } = buildComponent({ deliverableId: 'deliverable-1' }, deliverable);

			component.updateDates('2026-01-01', '2026-12-31');
			expect(saveDeliverable).toHaveBeenNthCalledWith(1, expect.objectContaining({ startDate: '2026-01-01', endDate: '2026-12-31' }));

			component.updateDates('', '');
			expect(saveDeliverable).toHaveBeenNthCalledWith(2, expect.objectContaining({ startDate: undefined, endDate: undefined }));
		});

		it('ignores every field update when no deliverable is loaded', () => {
			const { component } = buildComponent();

			component.updateTitle('New title');
			component.updateDates('2026-01-01', '2026-12-31');
			component.updateDescription('New desc');
			component.updateIsPrincipal(true);
			component.updateHidden(true);

			expect(saveDeliverable).not.toHaveBeenCalled();
		});
	});

	describe('selectCustomer', () => {
		it('picks the first result, resolves the name and saves', () => {
			const deliverable: Deliverable = { id: 'deliverable-1', title: 'D', isPrincipal: false };
			const picked: Customer = { id: 'customer-2', firstName: 'New' };
			const { component } = buildComponent({ deliverableId: 'deliverable-1' }, deliverable, { selectDialogResult: { customers: [picked] } });

			component.selectCustomer();

			expect(openCustomerSelectDialog).toHaveBeenCalledWith(
				expect.objectContaining({ selectionConstraints: { single: true, maxCustomers: 1, minCustomers: 1 }, alreadySelectedCustomers: [] })
			);
			expect(component.selectedCustomer()).toEqual(picked);
			expect(saveDeliverable).toHaveBeenCalledWith(expect.objectContaining({ customerId: 'customer-2' }));
		});

		it('passes the currently selected customer to the picker', () => {
			const deliverable: Deliverable = { id: 'deliverable-1', title: 'D', isPrincipal: false, customerId: 'customer-1' };
			const customer: Customer = { id: 'customer-1', firstName: 'Ada' };
			const { component } = buildComponent({ deliverableId: 'deliverable-1' }, deliverable, { customer });

			component.selectCustomer();

			expect(openCustomerSelectDialog).toHaveBeenCalledWith(expect.objectContaining({ alreadySelectedCustomers: [customer] }));
		});

		it('clears the customer when the picker is dismissed, since selectCustomer has no result guard', () => {
			const deliverable: Deliverable = { id: 'deliverable-1', title: 'D', isPrincipal: false, customerId: 'customer-1' };
			const customer: Customer = { id: 'customer-1', firstName: 'Ada' };
			const { component } = buildComponent({ deliverableId: 'deliverable-1' }, deliverable, { customer, selectDialogResult: undefined });
			expect(component.selectedCustomer()).toEqual(customer);

			component.selectCustomer();

			expect(component.selectedCustomer()).toBeNull();
			expect(saveDeliverable).toHaveBeenCalledWith(expect.objectContaining({ customerId: undefined }));
		});

		it('opens the picker but does nothing to selection or storage when no deliverable is loaded', () => {
			const { component } = buildComponent({}, null, { selectDialogResult: { customers: [{ id: 'customer-2', firstName: 'New' }] } });

			component.selectCustomer();

			expect(openCustomerSelectDialog).toHaveBeenCalled();
			expect(component.selectedCustomer()).toBeNull();
			expect(saveDeliverable).not.toHaveBeenCalled();
		});
	});

	describe('clearCustomer', () => {
		it('drops the selection and saves', () => {
			const deliverable: Deliverable = { id: 'deliverable-1', title: 'D', isPrincipal: false, customerId: 'customer-1' };
			const customer: Customer = { id: 'customer-1', firstName: 'Ada' };
			const { component } = buildComponent({ deliverableId: 'deliverable-1' }, deliverable, { customer });

			component.clearCustomer();

			expect(component.selectedCustomer()).toBeNull();
			expect(saveDeliverable).toHaveBeenCalledWith(expect.objectContaining({ customerId: undefined }));
		});

		it('does nothing when no deliverable is loaded', () => {
			const { component } = buildComponent();

			component.clearCustomer();

			expect(saveDeliverable).not.toHaveBeenCalled();
		});
	});
});
