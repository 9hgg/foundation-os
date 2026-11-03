import { TestBed } from '@angular/core/testing';
import { FacilitiesRepository } from '@edf/edf-project-rands/state';
import { BehaviorSubject } from 'rxjs';
import { FacilityPillComponent } from './facility-pill.component';

describe('FacilityPillComponent', () => {
	const buildFixture = (loaded: unknown = { id: 'facility-1', name: 'Test bench' }) => {
		const facility$ = new BehaviorSubject<unknown>(loaded);
		const getObjectByIdPullOnce$$$ = vi.fn(() => ({ $: facility$ }));

		TestBed.configureTestingModule({ providers: [{ provide: FacilitiesRepository, useValue: { store: { getObjectByIdPullOnce$$$ } } }] });
		TestBed.overrideComponent(FacilityPillComponent, { set: { template: '', imports: [], styles: [] } });

		const fixture = TestBed.createComponent(FacilityPillComponent);
		return { fixture, component: fixture.componentInstance, getObjectByIdPullOnce$$$, facility$ };
	};

	afterEach(() => TestBed.resetTestingModule());

	it('keeps the default name until it is told which facility to show', () => {
		const { fixture, component, getObjectByIdPullOnce$$$ } = buildFixture();
		fixture.detectChanges();

		expect(getObjectByIdPullOnce$$$).not.toHaveBeenCalled();
		expect(component.facilityPublicName()).toBe('facility');
	});

	it('loads the name of the facility named by id', () => {
		const { fixture, component, getObjectByIdPullOnce$$$ } = buildFixture();
		fixture.componentRef.setInput('facilityId', 'facility-1');
		fixture.detectChanges();

		expect(getObjectByIdPullOnce$$$).toHaveBeenCalledWith('facility-1');
		expect(component.facilityPublicName()).toBe('Test bench');
	});

	it('resolves the id from the facility object when no facilityId is given', () => {
		const { fixture, getObjectByIdPullOnce$$$ } = buildFixture();
		fixture.componentRef.setInput('facility', { id: 'facility-2', name: 'Other bench' });
		fixture.detectChanges();

		expect(getObjectByIdPullOnce$$$).toHaveBeenCalledWith('facility-2');
	});

	it('falls back to the id of an unnamed facility', () => {
		const { fixture, component } = buildFixture({ id: 'facility-1', name: '' });
		fixture.componentRef.setInput('facilityId', 'facility-1');
		fixture.detectChanges();

		expect(component.facilityPublicName()).toBe('facility-1');
	});

	it('truncates a name longer than the maximum', () => {
		const { fixture, component } = buildFixture({ id: 'facility-1', name: 'a'.repeat(40) });
		fixture.componentRef.setInput('facilityId', 'facility-1');
		fixture.componentRef.setInput('maxLength', 10);
		fixture.detectChanges();

		expect(component.facilityPublicNameTruncated()).toBe('aaaaaaaaaa...');
	});

	it('leaves a short name alone, and leaves any name alone without a maximum', () => {
		const { fixture, component } = buildFixture();
		fixture.componentRef.setInput('facilityId', 'facility-1');
		fixture.detectChanges();
		expect(component.facilityPublicNameTruncated()).toBe('Test bench');

		fixture.componentRef.setInput('maxLength', null);
		fixture.detectChanges();
		expect(component.facilityPublicNameTruncated()).toBe('Test bench');
	});

	it('stops listening once destroyed', () => {
		const { fixture, component } = buildFixture();
		fixture.componentRef.setInput('facilityId', 'facility-1');
		fixture.detectChanges();

		expect(() => component.ngOnDestroy()).not.toThrow();
	});
});
