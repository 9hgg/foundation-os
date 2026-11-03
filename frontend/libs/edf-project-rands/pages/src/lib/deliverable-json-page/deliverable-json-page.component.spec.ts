import { TestBed } from '@angular/core/testing';
import { DeliverablesRepository } from '@edf/edf-project-rands/state';
import { BehaviorSubject } from 'rxjs';
import { DeliverableJsonPageComponent } from './deliverable-json-page.component';

describe('DeliverableJsonPageComponent', () => {
	const buildFixture = () => {
		const item$ = new BehaviorSubject<unknown>({ id: 'deliverable-1', title: 'One' });
		const getObjectByIdPullOnce$$$ = vi.fn(() => ({ $: item$ }));

		TestBed.configureTestingModule({ providers: [{ provide: DeliverablesRepository, useValue: { store: { getObjectByIdPullOnce$$$ } } }] });
		TestBed.overrideComponent(DeliverableJsonPageComponent, { set: { template: '', imports: [] } });

		const fixture = TestBed.createComponent(DeliverableJsonPageComponent);
		fixture.detectChanges();

		return { fixture, component: fixture.componentInstance, getObjectByIdPullOnce$$$ };
	};

	afterEach(() => TestBed.resetTestingModule());

	it('holds nothing until an id arrives', () => {
		const { component, getObjectByIdPullOnce$$$ } = buildFixture();

		expect(component.deliverableId()).toBeNull();
		expect(component.deliverable$$$.value).toBeNull();
		expect(getObjectByIdPullOnce$$$).not.toHaveBeenCalled();
	});

	it('pulls the resource once an id is set', () => {
		const { fixture, component, getObjectByIdPullOnce$$$ } = buildFixture();

		fixture.componentRef.setInput('deliverableId', 'deliverable-1');
		fixture.detectChanges();

		expect(getObjectByIdPullOnce$$$).toHaveBeenCalledWith('deliverable-1');
		expect(component.deliverable$$$.value).toMatchObject({ id: 'deliverable-1' });
	});

	it('goes back to nothing when the id is cleared', () => {
		const { fixture, component } = buildFixture();
		fixture.componentRef.setInput('deliverableId', 'deliverable-1');
		fixture.detectChanges();

		fixture.componentRef.setInput('deliverableId', null);
		fixture.detectChanges();

		expect(component.deliverable$$$.value).toBeNull();
	});
});
