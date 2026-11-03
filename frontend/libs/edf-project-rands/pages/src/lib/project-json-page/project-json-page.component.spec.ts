import { TestBed } from '@angular/core/testing';
import { ProjectsRepository } from '@edf/edf-project-rands/state';
import { BehaviorSubject } from 'rxjs';
import { ProjectJsonPageComponent } from './project-json-page.component';

describe('ProjectJsonPageComponent', () => {
	const buildFixture = () => {
		const item$ = new BehaviorSubject<unknown>({ id: 'project-1', name: 'One' });
		const getObjectByIdPullOnce$$$ = vi.fn(() => ({ $: item$ }));

		TestBed.configureTestingModule({ providers: [{ provide: ProjectsRepository, useValue: { store: { getObjectByIdPullOnce$$$ } } }] });
		TestBed.overrideComponent(ProjectJsonPageComponent, { set: { template: '', imports: [] } });

		const fixture = TestBed.createComponent(ProjectJsonPageComponent);
		fixture.detectChanges();

		return { fixture, component: fixture.componentInstance, getObjectByIdPullOnce$$$ };
	};

	afterEach(() => TestBed.resetTestingModule());

	it('holds nothing until an id arrives', () => {
		const { component, getObjectByIdPullOnce$$$ } = buildFixture();

		expect(component.projectId()).toBeNull();
		expect(component.project$$$.value).toBeNull();
		expect(getObjectByIdPullOnce$$$).not.toHaveBeenCalled();
	});

	it('pulls the resource once an id is set', () => {
		const { fixture, component, getObjectByIdPullOnce$$$ } = buildFixture();

		fixture.componentRef.setInput('projectId', 'project-1');
		fixture.detectChanges();

		expect(getObjectByIdPullOnce$$$).toHaveBeenCalledWith('project-1');
		expect(component.project$$$.value).toMatchObject({ id: 'project-1' });
	});

	it('goes back to nothing when the id is cleared', () => {
		const { fixture, component } = buildFixture();
		fixture.componentRef.setInput('projectId', 'project-1');
		fixture.detectChanges();

		fixture.componentRef.setInput('projectId', null);
		fixture.detectChanges();

		expect(component.project$$$.value).toBeNull();
	});
});
