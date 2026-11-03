import { TestBed } from '@angular/core/testing';
import { CustomersRepository } from '@edf/edf-project-rands/state';
import { BehaviorSubject } from 'rxjs';
import { CustomerPillComponent } from './customer-pill.component';

describe('CustomerPillComponent', () => {
	const buildFixture = (loaded: unknown = { id: 'customer-1', firstName: 'Ada', lastName: 'Lovelace' }) => {
		const customer$ = new BehaviorSubject<unknown>(loaded);
		const getObjectByIdPullOnce$$$ = vi.fn(() => ({ $: customer$ }));

		TestBed.configureTestingModule({ providers: [{ provide: CustomersRepository, useValue: { store: { getObjectByIdPullOnce$$$ } } }] });
		TestBed.overrideComponent(CustomerPillComponent, { set: { template: '', imports: [], styles: [] } });

		const fixture = TestBed.createComponent(CustomerPillComponent);
		return { fixture, component: fixture.componentInstance, getObjectByIdPullOnce$$$, customer$ };
	};

	afterEach(() => TestBed.resetTestingModule());

	it('keeps the default name until it is told which customer to show', () => {
		const { fixture, component, getObjectByIdPullOnce$$$ } = buildFixture();
		fixture.detectChanges();

		expect(getObjectByIdPullOnce$$$).not.toHaveBeenCalled();
		expect(component.customerPublicName()).toBe('customer');
	});

	it('loads the full name of the customer named by id', () => {
		const { fixture, component, getObjectByIdPullOnce$$$ } = buildFixture();
		fixture.componentRef.setInput('customerId', 'customer-1');
		fixture.detectChanges();

		expect(getObjectByIdPullOnce$$$).toHaveBeenCalledWith('customer-1');
		expect(component.customerPublicName()).toBe('Ada Lovelace');
	});

	it('resolves the id from the customer object when no customerId is given', () => {
		const { fixture, getObjectByIdPullOnce$$$ } = buildFixture();
		fixture.componentRef.setInput('customer', { id: 'customer-2', firstName: 'Grace', lastName: 'Hopper' });
		fixture.detectChanges();

		expect(getObjectByIdPullOnce$$$).toHaveBeenCalledWith('customer-2');
	});

	it('falls back to the identifier when the customer has no name', () => {
		const { fixture, component } = buildFixture({ id: 'customer-1', identifier: 'CUST-42' });
		fixture.componentRef.setInput('customerId', 'customer-1');
		fixture.detectChanges();

		expect(component.customerPublicName()).toBe('CUST-42');
	});

	it('falls back to the id when the customer has neither a name nor an identifier', () => {
		const { fixture, component } = buildFixture({ id: 'customer-1' });
		fixture.componentRef.setInput('customerId', 'customer-1');
		fixture.detectChanges();

		expect(component.customerPublicName()).toBe('customer-1');
	});

	it('truncates a name longer than the maximum', () => {
		const { fixture, component } = buildFixture({ id: 'customer-1', firstName: 'a'.repeat(40), lastName: '' });
		fixture.componentRef.setInput('customerId', 'customer-1');
		fixture.componentRef.setInput('maxLength', 10);
		fixture.detectChanges();

		expect(component.customerPublicNameTruncated()).toBe('aaaaaaaaaa...');
	});

	it('leaves a short name alone, and leaves any name alone without a maximum', () => {
		const { fixture, component } = buildFixture();
		fixture.componentRef.setInput('customerId', 'customer-1');
		fixture.detectChanges();
		expect(component.customerPublicNameTruncated()).toBe('Ada Lovelace');

		fixture.componentRef.setInput('maxLength', null);
		fixture.detectChanges();
		expect(component.customerPublicNameTruncated()).toBe('Ada Lovelace');
	});

	it('stops listening once destroyed', () => {
		const { fixture, component } = buildFixture();
		fixture.componentRef.setInput('customerId', 'customer-1');
		fixture.detectChanges();

		expect(() => component.ngOnDestroy()).not.toThrow();
	});
});
