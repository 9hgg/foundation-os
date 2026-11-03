import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { BehaviorSubject, of } from 'rxjs';
import { NotificationService } from '@foundation/notification';
import { Customer } from '@edf/edf-project-rands/models';
import { CustomersRepository } from '@edf/edf-project-rands/state';
import { CustomerBuilderPageComponent } from './customer-builder-page.component';

describe('CustomerBuilderPageComponent', () => {
	let getObjectByIdPullOnce$$$: ReturnType<typeof vi.fn>;
	let save: ReturnType<typeof vi.fn>;

	// The customerId param is read synchronously off ActivatedRoute during construction, so the
	// route mock must already carry its params before buildComponent() runs.
	const buildComponent = (params: Record<string, string> = {}, customer: Customer | null = null) => {
		getObjectByIdPullOnce$$$ = vi.fn().mockReturnValue({ $: of(customer) });
		save = vi.fn();
		const paramMap$ = new BehaviorSubject(convertToParamMap(params));

		TestBed.configureTestingModule({
			imports: [CustomerBuilderPageComponent],
			providers: [
				{ provide: NotificationService, useValue: {} },
				{ provide: CustomersRepository, useValue: { store: { getObjectByIdPullOnce$$$, save } } },
				{ provide: ActivatedRoute, useValue: { paramMap: paramMap$ } },
			],
		});
		// Skip mounting the real template (translate directive, router link) -- only the class
		// logic is under test here.
		TestBed.overrideComponent(CustomerBuilderPageComponent, { set: { template: '' } });
		const fixture = TestBed.createComponent(CustomerBuilderPageComponent);
		fixture.detectChanges();
		return { component: fixture.componentInstance, fixture, paramMap$ };
	};

	afterEach(() => TestBed.resetTestingModule());

	it('stays empty when opened without a customerId', () => {
		const { component } = buildComponent();

		expect(component.customerId()).toBeNull();
		expect(component.customer$$$.value).toBeNull();
		expect(getObjectByIdPullOnce$$$).not.toHaveBeenCalled();
	});

	it('loads the customer named by the route', () => {
		const customer: Customer = { id: 'customer-1', firstName: 'Ada', lastName: 'Lovelace', identifier: 'C-001', unit: 'R&D' };
		const { component } = buildComponent({ customerId: 'customer-1' }, customer);

		expect(getObjectByIdPullOnce$$$).toHaveBeenCalledWith('customer-1');
		expect(component.customer$$$.value).toEqual(customer);
	});

	it('reloads when the route param changes, and clears when it is removed', () => {
		const customer: Customer = { id: 'customer-1', firstName: 'Ada', lastName: 'Lovelace' };
		const { component, fixture, paramMap$ } = buildComponent({ customerId: 'customer-1' }, customer);
		expect(component.customer$$$.value).toEqual(customer);

		paramMap$.next(convertToParamMap({}));
		fixture.detectChanges();

		expect(component.customerId()).toBeNull();
		expect(component.customer$$$.value).toBeNull();
	});

	it('updateNames patches first and last name and saves', () => {
		const customer: Customer = { id: 'customer-1', firstName: 'Ada', lastName: 'Lovelace' };
		const { component } = buildComponent({ customerId: 'customer-1' }, customer);

		component.updateNames('Alice', 'Martin');

		expect(save).toHaveBeenCalledWith(expect.objectContaining({ id: 'customer-1', firstName: 'Alice', lastName: 'Martin' }));
	});

	it('updateIdentifier and updateUnit patch their fields and save', () => {
		const customer: Customer = { id: 'customer-1', firstName: 'Ada', lastName: 'Lovelace', identifier: 'C-001', unit: 'R&D' };
		const { component } = buildComponent({ customerId: 'customer-1' }, customer);

		component.updateIdentifier('C-002');
		component.updateUnit('Innovation');

		expect(save).toHaveBeenNthCalledWith(1, expect.objectContaining({ identifier: 'C-002' }));
		expect(save).toHaveBeenNthCalledWith(2, expect.objectContaining({ unit: 'Innovation' }));
	});

	it('ignores every update when no customer is loaded', () => {
		const { component } = buildComponent();

		component.updateNames('Alice', 'Martin');
		component.updateIdentifier('C-002');
		component.updateUnit('Innovation');

		expect(save).not.toHaveBeenCalled();
	});
});
