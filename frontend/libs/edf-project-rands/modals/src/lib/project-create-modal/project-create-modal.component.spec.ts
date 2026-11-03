import { DialogRef } from '@angular/cdk/dialog';
import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { ContributorsRepository, CustomersRepository } from '@edf/edf-project-rands/state';
import { ContributorsModals } from '../contributors.modals';
import { CustomersModals } from '../customers.modals';
import { ProjectCreateModalComponent } from './project-create-modal.component';

describe('ProjectCreateModalComponent', () => {
	let close: ReturnType<typeof vi.fn>;
	let getCustomerByIdPullOnce$$$: ReturnType<typeof vi.fn>;
	let getContributorByIdPullOnce$$$: ReturnType<typeof vi.fn>;
	let openCustomerSelectDialog: ReturnType<typeof vi.fn>;
	let openContributorSelectDialog: ReturnType<typeof vi.fn>;

	// No id signal starts populated, so nothing here is fetched during construction -- every mock
	// below may be (re)configured any time before the action that triggers it (selectCustomer,
	// selectContributor), even after the component is already built.
	const buildComponent = () => {
		close = vi.fn();
		getCustomerByIdPullOnce$$$ = vi.fn().mockReturnValue({ $: of(null) });
		getContributorByIdPullOnce$$$ = vi.fn().mockReturnValue({ $: of(null) });
		openCustomerSelectDialog = vi.fn().mockReturnValue({ closed: of(undefined) });
		openContributorSelectDialog = vi.fn().mockReturnValue({ closed: of(undefined) });

		TestBed.configureTestingModule({
			imports: [ProjectCreateModalComponent],
			providers: [
				{ provide: DialogRef, useValue: { close } },
				{ provide: CustomersRepository, useValue: { store: { getObjectByIdPullOnce$$$: getCustomerByIdPullOnce$$$ } } },
				{ provide: ContributorsRepository, useValue: { store: { getObjectByIdPullOnce$$$: getContributorByIdPullOnce$$$ } } },
				{ provide: CustomersModals, useValue: { openCustomerSelectDialog } },
				{ provide: ContributorsModals, useValue: { openContributorSelectDialog } },
			],
		});
		const fixture = TestBed.createComponent(ProjectCreateModalComponent);
		fixture.detectChanges();
		return { component: fixture.componentInstance, fixture };
	};

	afterEach(() => TestBed.resetTestingModule());

	it('starts with sane defaults and no linked people', () => {
		const { component } = buildComponent();

		expect(component.name()).toBe('');
		expect(component.code()).toBe('NEW');
		expect(component.mainCustomerName()).toBeNull();
		expect(component.sponsorCustomerName()).toBeNull();
		expect(component.projectManagerName()).toBeNull();
		expect(component.strategicLeadName()).toBeNull();
	});

	describe('selecting the main customer', () => {
		it('resolves and displays the chosen customer name', () => {
			const { component, fixture } = buildComponent();
			getCustomerByIdPullOnce$$$.mockReturnValue({ $: of({ id: 'cust-1', firstName: 'Ada', lastName: 'Lovelace' }) });
			openCustomerSelectDialog.mockReturnValue({ closed: of({ customers: [{ id: 'cust-1' }] }) });

			component.selectCustomer('main');
			fixture.detectChanges();

			expect(openCustomerSelectDialog).toHaveBeenCalledWith(expect.objectContaining({ selectionConstraints: { single: true, minCustomers: 1, maxCustomers: 1 } }));
			expect(component.mainCustomerId()).toBe('cust-1');
			expect(getCustomerByIdPullOnce$$$).toHaveBeenCalledWith('cust-1');
			expect(component.mainCustomerName()).toBe('Ada Lovelace');
		});

		it('does nothing when the picker is dismissed or returns nothing', () => {
			const { component } = buildComponent();
			openCustomerSelectDialog.mockReturnValue({ closed: of({ customers: [] }) });

			component.selectCustomer('main');

			expect(component.mainCustomerId()).toBeNull();
		});

		it('clearing drops both the id and the resolved name', () => {
			const { component, fixture } = buildComponent();
			getCustomerByIdPullOnce$$$.mockReturnValue({ $: of({ id: 'cust-1', firstName: 'Ada', lastName: 'Lovelace' }) });
			openCustomerSelectDialog.mockReturnValue({ closed: of({ customers: [{ id: 'cust-1' }] }) });
			component.selectCustomer('main');
			fixture.detectChanges();
			expect(component.mainCustomerName()).toBe('Ada Lovelace');

			component.clear('main');
			fixture.detectChanges();

			expect(component.mainCustomerId()).toBeNull();
			expect(component.mainCustomerName()).toBeNull();
		});
	});

	it('selecting the sponsor customer sets the sponsor id and name independently of the main one', () => {
		const { component, fixture } = buildComponent();
		getCustomerByIdPullOnce$$$.mockImplementation((id: string) => ({ $: of(id === 'sponsor-1' ? { id, firstName: 'Bob', lastName: null } : null) }));
		openCustomerSelectDialog.mockReturnValue({ closed: of({ customers: [{ id: 'sponsor-1' }] }) });

		component.selectCustomer('sponsor');
		fixture.detectChanges();

		expect(component.sponsorCustomerId()).toBe('sponsor-1');
		expect(component.sponsorCustomerName()).toBe('Bob');
		expect(component.mainCustomerId()).toBeNull();
	});

	it('selecting a contributor for pm and strategic lead resolves each name independently', () => {
		const { component, fixture } = buildComponent();
		getContributorByIdPullOnce$$$.mockImplementation((id: string) => ({
			$: of(id === 'pm-1' ? { id, firstName: 'Rita', lastName: 'Levi' } : { id, firstName: 'Grace', lastName: 'Hopper' }),
		}));
		openContributorSelectDialog
			.mockReturnValueOnce({ closed: of({ contributors: [{ id: 'pm-1' }] }) })
			.mockReturnValueOnce({ closed: of({ contributors: [{ id: 'lead-1' }] }) });

		component.selectContributor('pm');
		fixture.detectChanges();
		component.selectContributor('strategic');
		fixture.detectChanges();

		expect(component.projectManagerName()).toBe('Rita Levi');
		expect(component.strategicLeadName()).toBe('Grace Hopper');

		component.clear('pm');
		component.clear('strategic');
		fixture.detectChanges();
		expect(component.projectManagerName()).toBeNull();
		expect(component.strategicLeadName()).toBeNull();
	});

	describe('save', () => {
		it('builds the result with the config block, defaulting blanks to undefined', () => {
			const { component } = buildComponent();
			component.name.set('Big Project');
			component.code.set('BP');
			component.startDate.set('2024-01-01');

			component.save();

			expect(close).toHaveBeenCalledWith({
				name: 'Big Project',
				code: 'BP',
				description: undefined,
				startDate: '2024-01-01',
				endDate: undefined,
				config: {
					mainCustomerId: undefined,
					sponsorCustomerId: undefined,
					projectManagerContributorId: undefined,
					strategicLeadContributorId: undefined,
				},
			});
		});

		it('carries the linked people ids through when set', () => {
			const { component, fixture } = buildComponent();
			openCustomerSelectDialog.mockReturnValue({ closed: of({ customers: [{ id: 'cust-1' }] }) });
			component.selectCustomer('main');
			fixture.detectChanges();
			component.name.set('P');

			component.save();

			expect(close).toHaveBeenCalledWith(expect.objectContaining({ config: expect.objectContaining({ mainCustomerId: 'cust-1' }) }));
		});
	});

	it('cancel closes the dialog with no result', () => {
		const { component } = buildComponent();

		component.cancel();

		expect(close).toHaveBeenCalledWith(undefined);
	});
});
