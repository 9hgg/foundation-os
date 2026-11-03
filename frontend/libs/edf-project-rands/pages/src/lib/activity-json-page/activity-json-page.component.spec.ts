import { TestBed } from '@angular/core/testing';
import { ActivitiesRepository } from '@edf/edf-project-rands/state';
import { BehaviorSubject } from 'rxjs';
import { ActivityJsonPageComponent } from './activity-json-page.component';

describe('ActivityJsonPageComponent', () => {
	const buildFixture = () => {
		const item$ = new BehaviorSubject<unknown>({ id: 'activity-1', title: 'One' });
		const getObjectByIdPullOnce$$$ = vi.fn(() => ({ $: item$ }));

		TestBed.configureTestingModule({ providers: [{ provide: ActivitiesRepository, useValue: { store: { getObjectByIdPullOnce$$$ } } }] });
		TestBed.overrideComponent(ActivityJsonPageComponent, { set: { template: '', imports: [] } });

		const fixture = TestBed.createComponent(ActivityJsonPageComponent);
		fixture.detectChanges();

		return { fixture, component: fixture.componentInstance, getObjectByIdPullOnce$$$ };
	};

	afterEach(() => TestBed.resetTestingModule());

	it('holds nothing until an id arrives', () => {
		const { component, getObjectByIdPullOnce$$$ } = buildFixture();

		expect(component.activityId()).toBeNull();
		expect(component.activity$$$.value).toBeNull();
		expect(getObjectByIdPullOnce$$$).not.toHaveBeenCalled();
	});

	it('pulls the resource once an id is set', () => {
		const { fixture, component, getObjectByIdPullOnce$$$ } = buildFixture();

		fixture.componentRef.setInput('activityId', 'activity-1');
		fixture.detectChanges();

		expect(getObjectByIdPullOnce$$$).toHaveBeenCalledWith('activity-1');
		expect(component.activity$$$.value).toMatchObject({ id: 'activity-1' });
	});

	it('goes back to nothing when the id is cleared', () => {
		const { fixture, component } = buildFixture();
		fixture.componentRef.setInput('activityId', 'activity-1');
		fixture.detectChanges();

		fixture.componentRef.setInput('activityId', null);
		fixture.detectChanges();

		expect(component.activity$$$.value).toBeNull();
	});
});
