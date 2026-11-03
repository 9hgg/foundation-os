import { TestBed } from '@angular/core/testing';
import { CustomersRepository } from '@edf/edf-project-rands/state';
import { BehaviorSubject } from 'rxjs';
import { CustomerJsonPageComponent } from './customer-json-page.component';

describe('CustomerJsonPageComponent', () => {
	const buildFixture = () => {
		const item$ = new BehaviorSubject<unknown>({ id: 'customer-1', identifier: 'One' });
		const getObjectByIdPullOnce$$$ = vi.fn(() => ({ $: item$ }));

		TestBed.configureTestingModule({ providers: [{ provide: CustomersRepository, useValue: { store: { getObjectByIdPullOnce$$$ } } }] });
		TestBed.overrideComponent(CustomerJsonPageComponent, { set: { template: '', imports: [] } });

		const fixture = TestBed.createComponent(CustomerJsonPageComponent);
		fixture.detectChanges();

		return { fixture, component: fixture.componentInstance, getObjectByIdPullOnce$$$ };
	};

	afterEach(() => TestBed.resetTestingModule());

	it('holds nothing until an id arrives', () => {
		const { component, getObjectByIdPullOnce$$$ } = buildFixture();

		expect(component.customerId()).toBeNull();
		expect(component.customer$$$.value).toBeNull();
		expect(getObjectByIdPullOnce$$$).not.toHaveBeenCalled();
	});

	it('pulls the resource once an id is set', () => {
		const { fixture, component, getObjectByIdPullOnce$$$ } = buildFixture();

		fixture.componentRef.setInput('customerId', 'customer-1');
		fixture.detectChanges();

		expect(getObjectByIdPullOnce$$$).toHaveBeenCalledWith('customer-1');
		expect(component.customer$$$.value).toMatchObject({ id: 'customer-1' });
	});

	it('goes back to nothing when the id is cleared', () => {
		const { fixture, component } = buildFixture();
		fixture.componentRef.setInput('customerId', 'customer-1');
		fixture.detectChanges();

		fixture.componentRef.setInput('customerId', null);
		fixture.detectChanges();

		expect(component.customer$$$.value).toBeNull();
	});
});
