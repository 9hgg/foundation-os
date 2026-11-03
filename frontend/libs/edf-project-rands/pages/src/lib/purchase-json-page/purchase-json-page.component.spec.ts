import { TestBed } from '@angular/core/testing';
import { PurchasesRepository } from '@edf/edf-project-rands/state';
import { BehaviorSubject } from 'rxjs';
import { PurchaseJsonPageComponent } from './purchase-json-page.component';

describe('PurchaseJsonPageComponent', () => {
	const buildFixture = () => {
		const item$ = new BehaviorSubject<unknown>({ id: 'purchase-1', title: 'One' });
		const getObjectByIdPullOnce$$$ = vi.fn(() => ({ $: item$ }));

		TestBed.configureTestingModule({ providers: [{ provide: PurchasesRepository, useValue: { store: { getObjectByIdPullOnce$$$ } } }] });
		TestBed.overrideComponent(PurchaseJsonPageComponent, { set: { template: '', imports: [] } });

		const fixture = TestBed.createComponent(PurchaseJsonPageComponent);
		fixture.detectChanges();

		return { fixture, component: fixture.componentInstance, getObjectByIdPullOnce$$$ };
	};

	afterEach(() => TestBed.resetTestingModule());

	it('holds nothing until an id arrives', () => {
		const { component, getObjectByIdPullOnce$$$ } = buildFixture();

		expect(component.purchaseId()).toBeNull();
		expect(component.purchase$$$.value).toBeNull();
		expect(getObjectByIdPullOnce$$$).not.toHaveBeenCalled();
	});

	it('pulls the resource once an id is set', () => {
		const { fixture, component, getObjectByIdPullOnce$$$ } = buildFixture();

		fixture.componentRef.setInput('purchaseId', 'purchase-1');
		fixture.detectChanges();

		expect(getObjectByIdPullOnce$$$).toHaveBeenCalledWith('purchase-1');
		expect(component.purchase$$$.value).toMatchObject({ id: 'purchase-1' });
	});

	it('goes back to nothing when the id is cleared', () => {
		const { fixture, component } = buildFixture();
		fixture.componentRef.setInput('purchaseId', 'purchase-1');
		fixture.detectChanges();

		fixture.componentRef.setInput('purchaseId', null);
		fixture.detectChanges();

		expect(component.purchase$$$.value).toBeNull();
	});
});
