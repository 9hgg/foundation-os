import { of } from 'rxjs';
import { ProjectListPageComponent } from './project-list-page.component';

vi.mock('uuid', () => ({ v4: () => 'project-uuid' }));

describe('ProjectListPageComponent', () => {
	function createComponent() {
		const component = Object.create(ProjectListPageComponent.prototype) as any;
		component.projectsRepository = {
			store: {
				postObject$: vi.fn().mockReturnValue(of({ result: { data: { id: 'project-created' } } })),
			},
			goToProject: vi.fn(),
		};
		component._projectsModals = {
			openProjectCreateDialog: vi.fn().mockReturnValue({
				closed: of({
					name: 'Project',
					code: 'PRJ',
					description: 'Desc',
					startDate: '2026-01-01',
					endDate: '2026-12-31',
					config: { owner: 'team' },
				}),
			}),
		};
		return component;
	}

	it('creates a project and navigates to it', () => {
		const component = createComponent();

		component.createNew();

		expect(component.projectsRepository.store.postObject$).toHaveBeenCalledWith(
			expect.objectContaining({
				id: 'project-uuid',
				name: 'Project',
				code: 'PRJ',
				config: { owner: 'team' },
			})
		);
		expect(component.projectsRepository.goToProject).toHaveBeenCalledWith('project-created');
	});

	it('ignores cancelled project creation', () => {
		const component = createComponent();
		component._projectsModals.openProjectCreateDialog.mockReturnValueOnce({ closed: of(undefined) });

		component.createNew();

		expect(component.projectsRepository.store.postObject$).not.toHaveBeenCalled();
		expect(component.projectsRepository.goToProject).not.toHaveBeenCalled();
	});
});
