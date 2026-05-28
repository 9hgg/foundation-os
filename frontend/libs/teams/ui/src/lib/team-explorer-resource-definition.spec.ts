import { Dialog } from '@angular/cdk/dialog';
import { FoldersRepository } from '@foundation/folders/state';
import { AccessShareModalComponent } from '@foundation/shared/access';
import { Team } from '@foundation/teams/models';
import { TeamsRepository } from '@foundation/teams/state';
import { of } from 'rxjs';
import { createTeamExplorerResourceDefinition } from './team-explorer-resource-definition';

const team: Team = { id: 'team-1', name: 'Core team', config: {} };

describe('createTeamExplorerResourceDefinition', () => {
	let teamsRepository: {
		store: {
			getObjectByIdPullOnce$$$: ReturnType<typeof vi.fn>;
		};
		createNewTeam$: ReturnType<typeof vi.fn>;
	};
	let foldersRepository: {
		addResourceToFolder: ReturnType<typeof vi.fn>;
	};
	let dialog: {
		open: ReturnType<typeof vi.fn>;
	};
	let openSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		teamsRepository = {
			store: {
				getObjectByIdPullOnce$$$: vi.fn().mockReturnValue({ $: of(team) }),
			},
			createNewTeam$: vi.fn().mockReturnValue(of({ result: { team_id: 'team-2' } })),
		};
		foldersRepository = {
			addResourceToFolder: vi.fn().mockReturnValue(of({})),
		};
		dialog = {
			open: vi.fn(),
		};
		openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
	});

	afterEach(() => {
		openSpy.mockRestore();
	});

	it('defines the team resource metadata and loader', () => {
		const definition = createTeamExplorerResourceDefinition(
			teamsRepository as unknown as TeamsRepository,
			foldersRepository as unknown as FoldersRepository,
			dialog as unknown as Dialog
		);

		expect(definition.kind).toBe('team');
		expect(definition.getName(team)).toBe('Core team');
		expect(definition.getName({ id: 'team-2', config: {} })).toBe('Unknown team');
		definition.load('team-1').subscribe((loadedTeam) => expect(loadedTeam).toBe(team));
		expect(teamsRepository.store.getObjectByIdPullOnce$$$).toHaveBeenCalledWith('team-1');
	});

	it('opens the access share modal', () => {
		const definition = createTeamExplorerResourceDefinition(
			teamsRepository as unknown as TeamsRepository,
			foldersRepository as unknown as FoldersRepository,
			dialog as unknown as Dialog
		);

		definition.onShare(team);

		expect(dialog.open).toHaveBeenCalledWith(AccessShareModalComponent, { data: { resourceId: 'team-1', resourceKind: 'team' } });
	});

	it('opens the team builder action in a new tab', () => {
		const definition = createTeamExplorerResourceDefinition(
			teamsRepository as unknown as TeamsRepository,
			foldersRepository as unknown as FoldersRepository,
			dialog as unknown as Dialog
		);

		definition.actions[0].onClick(team);

		expect(window.open).toHaveBeenCalledWith('/host/dashboard/teams/team-1/builder', '_blank');
	});

	it('creates a team, adds it to the selected folder, and opens the builder', () => {
		const definition = createTeamExplorerResourceDefinition(
			teamsRepository as unknown as TeamsRepository,
			foldersRepository as unknown as FoldersRepository,
			dialog as unknown as Dialog
		);

		definition.createAction.onClick('folder-1').subscribe();

		expect(teamsRepository.createNewTeam$).toHaveBeenCalled();
		expect(foldersRepository.addResourceToFolder).toHaveBeenCalledWith('folder-1', 'team', 'team-2');
		expect(window.open).toHaveBeenCalledWith('/host/dashboard/teams/team-2/builder', '_blank');
	});

	it('creates a team without adding it to a folder when no folder id is provided', () => {
		const definition = createTeamExplorerResourceDefinition(
			teamsRepository as unknown as TeamsRepository,
			foldersRepository as unknown as FoldersRepository,
			dialog as unknown as Dialog
		);

		definition.createAction.onClick(null).subscribe();

		expect(foldersRepository.addResourceToFolder).not.toHaveBeenCalled();
		expect(window.open).toHaveBeenCalledWith('/host/dashboard/teams/team-2/builder', '_blank');
	});

	it('does not open the builder when creation returns no team id', () => {
		teamsRepository.createNewTeam$.mockReturnValue(of({ result: {} }));
		const definition = createTeamExplorerResourceDefinition(
			teamsRepository as unknown as TeamsRepository,
			foldersRepository as unknown as FoldersRepository,
			dialog as unknown as Dialog
		);

		definition.createAction.onClick('folder-1').subscribe();

		expect(foldersRepository.addResourceToFolder).not.toHaveBeenCalled();
		expect(window.open).not.toHaveBeenCalled();
	});
});
