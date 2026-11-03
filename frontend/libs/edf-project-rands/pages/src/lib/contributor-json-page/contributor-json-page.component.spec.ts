import { TestBed } from '@angular/core/testing';
import { ContributorsRepository } from '@edf/edf-project-rands/state';
import { BehaviorSubject } from 'rxjs';
import { ContributorJsonPageComponent } from './contributor-json-page.component';

describe('ContributorJsonPageComponent', () => {
	const buildFixture = () => {
		const item$ = new BehaviorSubject<unknown>({ id: 'contributor-1', firstName: 'One' });
		const getObjectByIdPullOnce$$$ = vi.fn(() => ({ $: item$ }));

		TestBed.configureTestingModule({ providers: [{ provide: ContributorsRepository, useValue: { store: { getObjectByIdPullOnce$$$ } } }] });
		TestBed.overrideComponent(ContributorJsonPageComponent, { set: { template: '', imports: [] } });

		const fixture = TestBed.createComponent(ContributorJsonPageComponent);
		fixture.detectChanges();

		return { fixture, component: fixture.componentInstance, getObjectByIdPullOnce$$$ };
	};

	afterEach(() => TestBed.resetTestingModule());

	it('holds nothing until an id arrives', () => {
		const { component, getObjectByIdPullOnce$$$ } = buildFixture();

		expect(component.contributorId()).toBeNull();
		expect(component.contributor$$$.value).toBeNull();
		expect(getObjectByIdPullOnce$$$).not.toHaveBeenCalled();
	});

	it('pulls the resource once an id is set', () => {
		const { fixture, component, getObjectByIdPullOnce$$$ } = buildFixture();

		fixture.componentRef.setInput('contributorId', 'contributor-1');
		fixture.detectChanges();

		expect(getObjectByIdPullOnce$$$).toHaveBeenCalledWith('contributor-1');
		expect(component.contributor$$$.value).toMatchObject({ id: 'contributor-1' });
	});

	it('goes back to nothing when the id is cleared', () => {
		const { fixture, component } = buildFixture();
		fixture.componentRef.setInput('contributorId', 'contributor-1');
		fixture.detectChanges();

		fixture.componentRef.setInput('contributorId', null);
		fixture.detectChanges();

		expect(component.contributor$$$.value).toBeNull();
	});
});
