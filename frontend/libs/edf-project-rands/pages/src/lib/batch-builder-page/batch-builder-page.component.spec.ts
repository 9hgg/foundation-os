import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { BehaviorSubject, of } from 'rxjs';
import { NotificationService } from '@foundation/notification';
import { ProjectsModals } from '@edf/edf-project-rands/modals';
import { Batch, Project } from '@edf/edf-project-rands/models';
import { BatchesRepository, ProjectsRepository } from '@edf/edf-project-rands/state';
import { BatchBuilderPageComponent } from './batch-builder-page.component';

describe('BatchBuilderPageComponent', () => {
	let getBatchById$$$: ReturnType<typeof vi.fn>;
	let getProjectById$$$: ReturnType<typeof vi.fn>;
	let saveBatch: ReturnType<typeof vi.fn>;
	let goToProject: ReturnType<typeof vi.fn>;
	let openProjectSelectDialog: ReturnType<typeof vi.fn>;

	// The batchId param and the batch/project resolution chain both run synchronously off the
	// mocks during construction, so everything must be configured before buildComponent() runs.
	const buildComponent = (
		params: Record<string, string> = {},
		batch: Batch | null = null,
		project: Project | null = null,
		selectDialogResult: { projects: Project[] } | undefined = undefined
	) => {
		getBatchById$$$ = vi.fn().mockReturnValue({ $: of(batch) });
		getProjectById$$$ = vi.fn().mockReturnValue({ $: of(project) });
		saveBatch = vi.fn();
		goToProject = vi.fn();
		openProjectSelectDialog = vi.fn().mockReturnValue({ closed: of(selectDialogResult) });
		const paramMap$ = new BehaviorSubject(convertToParamMap(params));

		TestBed.configureTestingModule({
			imports: [BatchBuilderPageComponent],
			providers: [
				{ provide: NotificationService, useValue: {} },
				{ provide: BatchesRepository, useValue: { store: { getObjectByIdPullOnce$$$: getBatchById$$$, save: saveBatch } } },
				{ provide: ProjectsRepository, useValue: { store: { getObjectByIdPullOnce$$$: getProjectById$$$ }, goToProject } },
				{ provide: ProjectsModals, useValue: { openProjectSelectDialog } },
				{ provide: ActivatedRoute, useValue: { paramMap: paramMap$ } },
			],
		});
		// Skip mounting the real template (translate directive, router link, lib-quill-textarea) --
		// only the class logic is under test here.
		TestBed.overrideComponent(BatchBuilderPageComponent, { set: { template: '' } });
		const fixture = TestBed.createComponent(BatchBuilderPageComponent);
		fixture.detectChanges();
		return { component: fixture.componentInstance, fixture, paramMap$ };
	};

	afterEach(() => TestBed.resetTestingModule());

	it('stays empty when opened without a batchId', () => {
		const { component } = buildComponent();

		expect(component.batch$$$.value).toBeNull();
		expect(component.selectedProject()).toBeNull();
		expect(getBatchById$$$).not.toHaveBeenCalled();
		expect(getProjectById$$$).not.toHaveBeenCalled();
	});

	it('loads the batch named by the route, with no linked project', () => {
		const batch: Batch = { id: 'batch-1', title: 'Batch', prefix: 'B', description: 'Desc', projectId: '' };
		const { component } = buildComponent({ batchId: 'batch-1' }, batch);

		expect(getBatchById$$$).toHaveBeenCalledWith('batch-1');
		expect(component.batch$$$.value).toEqual(batch);
		expect(component.selectedProject()).toBeNull();
		expect(getProjectById$$$).not.toHaveBeenCalled();
	});

	it('resolves the linked project when the batch has a projectId', () => {
		const batch: Batch = { id: 'batch-1', title: 'Batch', projectId: 'project-1' };
		const project: Project = { id: 'project-1', name: 'Project 1' } as Project;
		const { component } = buildComponent({ batchId: 'batch-1' }, batch, project);

		expect(getProjectById$$$).toHaveBeenCalledWith('project-1');
		expect(component.selectedProject()).toEqual(project);
	});

	it('updateTitle, updatePrefix and updateDescription patch their fields and save', () => {
		const batch: Batch = { id: 'batch-1', title: 'Old', prefix: '1', description: 'Old desc', projectId: '' };
		const { component } = buildComponent({ batchId: 'batch-1' }, batch);

		component.updateTitle('New title');
		component.updatePrefix('2');
		component.updateDescription('New desc');

		expect(saveBatch).toHaveBeenNthCalledWith(1, expect.objectContaining({ title: 'New title' }));
		expect(saveBatch).toHaveBeenNthCalledWith(2, expect.objectContaining({ prefix: '2' }));
		expect(saveBatch).toHaveBeenNthCalledWith(3, expect.objectContaining({ description: 'New desc' }));
	});

	it('ignores every field update when no batch is loaded', () => {
		const { component } = buildComponent();

		component.updateTitle('New title');
		component.updatePrefix('2');
		component.updateDescription('New desc');

		expect(saveBatch).not.toHaveBeenCalled();
	});

	describe('openSelectProject', () => {
		it('picks the first result, links the project and saves', () => {
			const batch: Batch = { id: 'batch-1', title: 'Batch', projectId: '' };
			const picked: Project = { id: 'project-9', name: 'Nine' } as Project;
			const { component } = buildComponent({ batchId: 'batch-1' }, batch, null, { projects: [picked] });

			component.openSelectProject();

			expect(openProjectSelectDialog).toHaveBeenCalledWith(
				expect.objectContaining({ selectionConstraints: { single: true, minProjects: 1, maxProjects: 1 }, alreadySelectedProjects: [] })
			);
			expect(component.selectedProject()).toEqual(picked);
			expect(saveBatch).toHaveBeenCalledWith(expect.objectContaining({ projectId: 'project-9' }));
		});

		it('passes the currently selected project to the picker', () => {
			const batch: Batch = { id: 'batch-1', title: 'Batch', projectId: 'project-1' };
			const project: Project = { id: 'project-1', name: 'Project 1' } as Project;
			const { component } = buildComponent({ batchId: 'batch-1' }, batch, project);

			component.openSelectProject();

			expect(openProjectSelectDialog).toHaveBeenCalledWith(expect.objectContaining({ alreadySelectedProjects: [project] }));
		});

		it('does nothing when the picker is dismissed or returns no projects', () => {
			const batch: Batch = { id: 'batch-1', title: 'Batch', projectId: '' };
			const { component } = buildComponent({ batchId: 'batch-1' }, batch, null, { projects: [] });

			component.openSelectProject();

			expect(component.selectedProject()).toBeNull();
			expect(saveBatch).not.toHaveBeenCalled();
		});
	});

	it('clearProject drops the link and saves', () => {
		const batch: Batch = { id: 'batch-1', title: 'Batch', projectId: 'project-1' };
		const project: Project = { id: 'project-1', name: 'Project 1' } as Project;
		const { component } = buildComponent({ batchId: 'batch-1' }, batch, project);

		component.clearProject();

		expect(component.selectedProject()).toBeNull();
		expect(saveBatch).toHaveBeenCalledWith(expect.objectContaining({ projectId: '' }));
	});

	it('clearProject does nothing when no batch is loaded', () => {
		const { component } = buildComponent();

		component.clearProject();

		expect(saveBatch).not.toHaveBeenCalled();
	});

	describe('goToProject', () => {
		it('navigates to the selected project', () => {
			const batch: Batch = { id: 'batch-1', title: 'Batch', projectId: 'project-1' };
			const project: Project = { id: 'project-1', name: 'Project 1' } as Project;
			const { component } = buildComponent({ batchId: 'batch-1' }, batch, project);

			component.goToProject();

			expect(goToProject).toHaveBeenCalledWith('project-1');
		});

		it('does nothing when no project is selected', () => {
			const { component } = buildComponent();

			component.goToProject();

			expect(goToProject).not.toHaveBeenCalled();
		});
	});
});
