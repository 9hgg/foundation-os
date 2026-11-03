import { of } from 'rxjs';
import { Project } from '@edf/edf-project-rands/models';
import { ProjectTableComponent } from './projects-table.component';

describe('projects-table.component', () => {
	const project: Project = {
		id: 'project-1',
		kind: 'project' as never,
		name: 'Original project',
		code: 'P1',
		config: {},
	} as never;

	const buildComponent = () => {
		const refresh = vi.fn(() => of(null));
		const putObject$ = vi.fn(() => of({ result: {} }));
		const deleteObject$ = vi.fn(() => of({ result: {} }));
		const goToProject = vi.fn();
		const prompt = vi.fn(() => ({ closed: of({ value: 'Renamed project' }) }));
		const confirm = vi.fn(() => ({ closed: of(true) }));
		const shareWithTeam = vi.fn();
		const openSharingDetails = vi.fn();
		const component = Object.create(ProjectTableComponent.prototype) as ProjectTableComponent;

		component['_repository'] = {
			store: { putObject$, deleteObject$ },
			goToProject,
		} as never;
		component['_notificationService'] = { prompt, confirm } as never;
		component['_accessService'] = { shareWithTeam, openSharingDetails } as never;
		component['_i18n_renameSentence'] = () => 'Give a new name to this project:';
		component['_i18n_deleteSentence'] = () => 'Are you sure you want to delete this project?';
		component.paginator = { refresh } as never;

		return { component, prompt, confirm, deleteObject$, goToProject, putObject$, refresh, shareWithTeam, openSharingDetails };
	};

	it('renames a project and refreshes the paginator', () => {
		const { component, prompt, putObject$, refresh } = buildComponent();

		component.renameProjects(project);

		expect(prompt).toHaveBeenCalledWith('Give a new name to this project:', undefined, { defaultValue: 'Original project' });
		expect(putObject$).toHaveBeenCalledWith({ ...project, name: 'Renamed project' });
		expect(refresh).toHaveBeenCalled();
	});

	it('skips rename when the prompt is cancelled', () => {
		const { component, prompt, putObject$ } = buildComponent();
		prompt.mockReturnValue({ closed: of(null) } as never);

		component.renameProjects(project);

		expect(putObject$).not.toHaveBeenCalled();
	});

	it('skips rename when the prompt is confirmed with an empty value', () => {
		const { component, prompt, putObject$ } = buildComponent();
		prompt.mockReturnValue({ closed: of({ value: '' }) } as never);

		component.renameProjects(project);

		expect(putObject$).not.toHaveBeenCalled();
	});

	it('deletes a project only after confirmation and refreshes the paginator', () => {
		const { component, confirm, deleteObject$, refresh } = buildComponent();

		component.deleteProjects(project);

		expect(confirm).toHaveBeenCalledWith('Are you sure you want to delete this project?');
		expect(deleteObject$).toHaveBeenCalledWith('project-1');
		expect(refresh).toHaveBeenCalled();
	});

	it('skips deletion when confirmation is rejected', () => {
		const { component, confirm, deleteObject$ } = buildComponent();
		confirm.mockReturnValue({ closed: of(false) });

		component.deleteProjects(project);

		expect(deleteObject$).not.toHaveBeenCalled();
	});

	it('delegates navigation to the repository', () => {
		const { component, goToProject } = buildComponent();

		component.goToProjects('project-1');

		expect(goToProject).toHaveBeenCalledWith('project-1');
	});

	it('delegates team sharing to the access service', () => {
		const { component, shareWithTeam } = buildComponent();

		component.shareWithTeam(project);

		expect(shareWithTeam).toHaveBeenCalledWith('project-1', 'project');
	});

	it('delegates opening sharing details to the access service', () => {
		const { component, openSharingDetails } = buildComponent();

		component.openSharingDetails(project);

		expect(openSharingDetails).toHaveBeenCalledWith('project-1', 'project');
	});
});
