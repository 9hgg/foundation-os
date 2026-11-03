import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { Batch, Project } from '@edf/edf-project-rands/models';
import { BatchesRepository, ProjectsRepository } from '@edf/edf-project-rands/state';
import { ProjectsModals } from '../projects.modals';
import { ActivityCreateModalComponent, ActivityCreateModalData } from './activity-create-modal.component';

interface Overrides {
	project?: Project | null;
	batches?: (Batch | null)[];
	batch?: Batch | null;
	selectDialogResult?: { projects: Project[] } | undefined;
}

describe('ActivityCreateModalComponent', () => {
	let close: ReturnType<typeof vi.fn>;
	let getProjectById$$$: ReturnType<typeof vi.fn>;
	let getObjects$: ReturnType<typeof vi.fn>;
	let getBatchById$$$: ReturnType<typeof vi.fn>;
	let openProjectSelectDialog: ReturnType<typeof vi.fn>;

	// Mocks are wired up with their final behavior BEFORE the component is constructed, since the
	// constructor eagerly subscribes to them -- configuring a mock's return value after
	// buildComponent() runs would be too late for anything the constructor already read.
	const buildComponent = (data: ActivityCreateModalData = {}, overrides: Overrides = {}) => {
		close = vi.fn();
		getProjectById$$$ = vi.fn().mockReturnValue({ $: of(overrides.project ?? null) });
		getObjects$ = vi.fn().mockReturnValue(of({ data: overrides.batches ?? [] }));
		getBatchById$$$ = vi.fn().mockReturnValue({ $: of(overrides.batch ?? null) });
		openProjectSelectDialog = vi.fn().mockReturnValue({ closed: of(overrides.selectDialogResult) });

		TestBed.configureTestingModule({
			imports: [ActivityCreateModalComponent],
			providers: [
				{ provide: DialogRef, useValue: { close } },
				{ provide: DIALOG_DATA, useValue: data },
				{ provide: ProjectsRepository, useValue: { store: { getObjectById$$$: getProjectById$$$ } } },
				{ provide: BatchesRepository, useValue: { store: { getObjects$, getObjectById$$$: getBatchById$$$ } } },
				{ provide: ProjectsModals, useValue: { openProjectSelectDialog } },
			],
		});
		// Avoid mounting the real lib-quill-textarea (needs QuillService/a real Quill instance);
		// the component's logic is what's under test here, not that child's rendering.
		TestBed.overrideComponent(ActivityCreateModalComponent, { set: { template: '' } });
		const fixture = TestBed.createComponent(ActivityCreateModalComponent);
		fixture.detectChanges();
		return fixture.componentInstance;
	};

	afterEach(() => TestBed.resetTestingModule());

	it('starts empty with no data', () => {
		const component = buildComponent();

		expect(component.title()).toBe('');
		expect(component.batches()).toEqual([]);
		expect(getProjectById$$$).not.toHaveBeenCalled();
		expect(getObjects$).not.toHaveBeenCalled();
	});

	it('seeds every simple field from the data it was opened with', () => {
		const component = buildComponent({
			title: 'Study X',
			prefix: 'SX',
			description: 'Desc',
			finality: 'Fin',
			strategicInterests: 'SI',
			synergies: 'Syn',
			risks: 'Risks',
			parades: 'Parades',
			priority: 3,
			isCorporate: true,
			isConfirmed: true,
			tags: ['a', 'b'],
		});

		expect(component.title()).toBe('Study X');
		expect(component.prefix()).toBe('SX');
		expect(component.description()).toBe('Desc');
		expect(component.finality()).toBe('Fin');
		expect(component.strategicInterests()).toBe('SI');
		expect(component.synergies()).toBe('Syn');
		expect(component.risks()).toBe('Risks');
		expect(component.parades()).toBe('Parades');
		expect(component.priority()).toBe(3);
		expect(component.isCorporate()).toBe(true);
		expect(component.isConfirmed()).toBe(true);
		expect(component.tagsStr()).toBe('a, b');
	});

	it('loads the project and its batches when opened with a projectId', () => {
		const component = buildComponent(
			{ projectId: 'project-1' },
			{ project: { id: 'project-1', name: 'Project 1' } as Project, batches: [{ id: 'batch-1', prefix: 'B', title: 'Batch' } as Batch, null] }
		);

		expect(getProjectById$$$).toHaveBeenCalledWith('project-1', true);
		expect(component.selectedProject()).toEqual({ id: 'project-1', name: 'Project 1' });
		expect(getObjects$).toHaveBeenCalledWith(1, 100, [{ fieldName: 'project_id', matchType: 'exact', value: 'project-1' }], 'prefix:asc', true);
		expect(component.batches()).toEqual([{ id: 'batch-1', prefix: 'B', title: 'Batch' }]);
	});

	it('loads a batch directly when opened with only a batchId, and infers its project', () => {
		const component = buildComponent(
			{ batchId: 'batch-1' },
			{ batch: { id: 'batch-1', title: 'Batch', projectId: 'project-2' } as Batch, project: { id: 'project-2', name: 'Project 2' } as Project }
		);

		expect(getBatchById$$$).toHaveBeenCalledWith('batch-1', true);
		expect(component.batches()).toEqual([{ id: 'batch-1', title: 'Batch', projectId: 'project-2' }]);
		expect(component.projectId()).toBe('project-2');
		expect(getProjectById$$$).toHaveBeenCalledWith('project-2', true);
		expect(component.selectedProject()).toEqual({ id: 'project-2', name: 'Project 2' });
	});

	it('does not infer a project when the batch has none, or when a projectId was already given', () => {
		const component = buildComponent({ batchId: 'batch-1' }, { batch: { id: 'batch-1', title: 'Batch' } as Batch });

		expect(component.projectId()).toBeNull();
		expect(getProjectById$$$).not.toHaveBeenCalled();
	});

	describe('selecting a project', () => {
		it('picks the first result, reloads batches for it, and clears the chosen batch', () => {
			const component = buildComponent({ batchId: 'stale-batch' }, { selectDialogResult: { projects: [{ id: 'project-9', name: 'Nine' } as Project] } });
			getObjects$.mockClear();

			component.selectProject();

			expect(openProjectSelectDialog).toHaveBeenCalledWith(expect.objectContaining({ selectionConstraints: { single: true, minProjects: 1, maxProjects: 1 } }));
			expect(component.projectId()).toBe('project-9');
			expect(component.selectedProject()).toEqual({ id: 'project-9', name: 'Nine' });
			expect(getObjects$).toHaveBeenCalled();
			expect(component.batchId()).toBeNull();
		});

		it('passes the current selection to the picker, and does nothing when it is dismissed', () => {
			const component = buildComponent({ projectId: 'project-1' }, { project: { id: 'project-1', name: 'Project 1' } as Project, selectDialogResult: undefined });

			component.selectProject();

			expect(openProjectSelectDialog).toHaveBeenCalledWith(expect.objectContaining({ alreadySelectedProjects: [{ id: 'project-1', name: 'Project 1' }] }));
			expect(component.projectId()).toBe('project-1');
		});

		it('does nothing when the picker returns no projects', () => {
			const component = buildComponent({}, { selectDialogResult: { projects: [] } });

			component.selectProject();

			expect(component.projectId()).toBeNull();
		});
	});

	it('clearProject resets the project, its batches and the chosen batch', () => {
		const component = buildComponent(
			{ projectId: 'project-1', batchId: 'batch-1' },
			{ project: { id: 'project-1', name: 'Project 1' } as Project, batches: [{ id: 'batch-1' } as Batch] }
		);

		component.clearProject();

		expect(component.projectId()).toBeNull();
		expect(component.selectedProject()).toBeNull();
		expect(component.batches()).toEqual([]);
		expect(component.batchId()).toBeNull();
	});

	describe('save', () => {
		it('builds the result, defaulting optional blanks to undefined and splitting tags', () => {
			const component = buildComponent({ batchId: 'batch-1' });
			component.title.set('Study X');
			component.tagsStr.set(' a , b ,, c ');

			component.save();

			expect(close).toHaveBeenCalledWith({
				title: 'Study X',
				prefix: undefined,
				batchId: 'batch-1',
				description: undefined,
				finality: undefined,
				strategicInterests: undefined,
				synergies: undefined,
				risks: undefined,
				parades: undefined,
				priority: 0,
				isCorporate: false,
				isConfirmed: false,
				tags: ['a', 'b', 'c'],
			});
		});

		it('falls back to an empty batchId when none was chosen', () => {
			const component = buildComponent();

			component.save();

			expect(close).toHaveBeenCalledWith(expect.objectContaining({ batchId: '' }));
		});
	});

	it('cancel closes the dialog with no result', () => {
		const component = buildComponent();

		component.cancel();

		expect(close).toHaveBeenCalledWith(undefined);
	});
});
