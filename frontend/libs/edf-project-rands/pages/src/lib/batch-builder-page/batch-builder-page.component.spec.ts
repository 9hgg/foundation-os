import { of } from 'rxjs';
import { BatchBuilderPageComponent } from './batch-builder-page.component';

function createSignal<T>(initialValue: T) {
	let value = initialValue;
	const signal: any = () => value;
	signal.set = (nextValue: T) => {
		value = nextValue;
	};
	return signal as (() => T) & { set: (value: T) => void };
}

describe('BatchBuilderPageComponent', () => {
	function createComponent() {
		const component = Object.create(BatchBuilderPageComponent.prototype) as any;
		component.batch$$$ = {
			value: { id: 'batch-1', title: 'Initial', prefix: '1', description: 'Desc', projectId: 'project-1' },
		};
		component.selectedProject = createSignal({ id: 'project-1' });
		component._batchesRepository = {
			store: {
				save: vi.fn(),
			},
		};
		component._projectsRepository = {
			goToProject: vi.fn(),
		};
		component._projectsModals = {
			openProjectSelectDialog: vi.fn().mockReturnValue({ closed: of({ projects: [{ id: 'project-2' }] }) }),
		};
		return component;
	}

	it('updates batch fields, links a project, clears it, and navigates', () => {
		const component = createComponent();

		component.updateTitle('Updated title');
		component.updatePrefix('2');
		component.updateDescription('Updated description');
		component.openSelectProject();
		component.clearProject();
		component.goToProject();

		expect(component.batch$$$.value).toEqual(
			expect.objectContaining({
				title: 'Updated title',
				prefix: '2',
				description: 'Updated description',
				projectId: '',
			})
		);
		expect(component._projectsModals.openProjectSelectDialog).toHaveBeenCalled();
		expect(component._batchesRepository.store.save).toHaveBeenCalled();
		expect(component._projectsRepository.goToProject).not.toHaveBeenCalled();

		component.selectedProject.set({ id: 'project-2' });
		component.goToProject();
		expect(component._projectsRepository.goToProject).toHaveBeenCalledWith('project-2');
	});
});
