import { TestBed } from '@angular/core/testing';
import { BatchesRepository } from '@edf/edf-project-rands/state';
import { BehaviorSubject } from 'rxjs';
import { BatchJsonPageComponent } from './batch-json-page.component';

describe('BatchJsonPageComponent', () => {
	const buildFixture = () => {
		const item$ = new BehaviorSubject<unknown>({ id: 'batch-1', title: 'One' });
		const getObjectByIdPullOnce$$$ = vi.fn(() => ({ $: item$ }));

		TestBed.configureTestingModule({ providers: [{ provide: BatchesRepository, useValue: { store: { getObjectByIdPullOnce$$$ } } }] });
		TestBed.overrideComponent(BatchJsonPageComponent, { set: { template: '', imports: [] } });

		const fixture = TestBed.createComponent(BatchJsonPageComponent);
		fixture.detectChanges();

		return { fixture, component: fixture.componentInstance, getObjectByIdPullOnce$$$ };
	};

	afterEach(() => TestBed.resetTestingModule());

	it('holds nothing until an id arrives', () => {
		const { component, getObjectByIdPullOnce$$$ } = buildFixture();

		expect(component.batchId()).toBeNull();
		expect(component.batch$$$.value).toBeNull();
		expect(getObjectByIdPullOnce$$$).not.toHaveBeenCalled();
	});

	it('pulls the resource once an id is set', () => {
		const { fixture, component, getObjectByIdPullOnce$$$ } = buildFixture();

		fixture.componentRef.setInput('batchId', 'batch-1');
		fixture.detectChanges();

		expect(getObjectByIdPullOnce$$$).toHaveBeenCalledWith('batch-1');
		expect(component.batch$$$.value).toMatchObject({ id: 'batch-1' });
	});

	it('goes back to nothing when the id is cleared', () => {
		const { fixture, component } = buildFixture();
		fixture.componentRef.setInput('batchId', 'batch-1');
		fixture.detectChanges();

		fixture.componentRef.setInput('batchId', null);
		fixture.detectChanges();

		expect(component.batch$$$.value).toBeNull();
	});
});
