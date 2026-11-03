import { TestBed } from '@angular/core/testing';
import { FacilitiesRepository } from '@edf/edf-project-rands/state';
import { BehaviorSubject } from 'rxjs';
import { FacilityJsonPageComponent } from './facility-json-page.component';

describe('FacilityJsonPageComponent', () => {
	const buildFixture = () => {
		const item$ = new BehaviorSubject<unknown>({ id: 'facility-1', name: 'One' });
		const getObjectByIdPullOnce$$$ = vi.fn(() => ({ $: item$ }));

		TestBed.configureTestingModule({ providers: [{ provide: FacilitiesRepository, useValue: { store: { getObjectByIdPullOnce$$$ } } }] });
		TestBed.overrideComponent(FacilityJsonPageComponent, { set: { template: '', imports: [] } });

		const fixture = TestBed.createComponent(FacilityJsonPageComponent);
		fixture.detectChanges();

		return { fixture, component: fixture.componentInstance, getObjectByIdPullOnce$$$ };
	};

	afterEach(() => TestBed.resetTestingModule());

	it('holds nothing until an id arrives', () => {
		const { component, getObjectByIdPullOnce$$$ } = buildFixture();

		expect(component.facilityId()).toBeNull();
		expect(component.facility$$$.value).toBeNull();
		expect(getObjectByIdPullOnce$$$).not.toHaveBeenCalled();
	});

	it('pulls the resource once an id is set', () => {
		const { fixture, component, getObjectByIdPullOnce$$$ } = buildFixture();

		fixture.componentRef.setInput('facilityId', 'facility-1');
		fixture.detectChanges();

		expect(getObjectByIdPullOnce$$$).toHaveBeenCalledWith('facility-1');
		expect(component.facility$$$.value).toMatchObject({ id: 'facility-1' });
	});

	it('goes back to nothing when the id is cleared', () => {
		const { fixture, component } = buildFixture();
		fixture.componentRef.setInput('facilityId', 'facility-1');
		fixture.detectChanges();

		fixture.componentRef.setInput('facilityId', null);
		fixture.detectChanges();

		expect(component.facility$$$.value).toBeNull();
	});
});
