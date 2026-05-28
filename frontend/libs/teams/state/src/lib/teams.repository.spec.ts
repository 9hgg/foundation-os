import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { RequestService } from '@foundation/network/services';
import { NotificationService } from '@foundation/notification';
import { TranslationService } from '@foundation/translations/services';
import { UsersRepository } from '@foundation/users/state';
import { TabManagerService } from '@foundation/utils';
import { NEVER, of } from 'rxjs';
import { TeamsRepository } from './teams.repository';

vi.mock('uuid', () => ({ v4: () => 'team-id' }));

const routerMock = {
	navigate: vi.fn(),
};

const requestServiceMock = {
	clearCache$: NEVER,
	getBasic$: vi.fn(),
	post$: vi.fn(),
	put$: vi.fn(),
};

const notificationMock = {
	prompt: vi.fn(),
};

const translationMock = {
	prep: vi.fn((value: string) => () => value),
};

const usersRepositoryMock = {
	currentProfile: vi.fn(),
};

const tabManagerServiceMock = {
	tabId: 'tab-1',
};

describe('teams.repository', () => {
	let repository: TeamsRepository;

	beforeEach(() => {
		vi.clearAllMocks();
		TestBed.configureTestingModule({
			providers: [
				TeamsRepository,
				{ provide: Router, useValue: routerMock },
				{ provide: RequestService, useValue: requestServiceMock },
				{ provide: NotificationService, useValue: notificationMock },
				{ provide: TranslationService, useValue: translationMock },
				{ provide: UsersRepository, useValue: usersRepositoryMock },
				{ provide: TabManagerService, useValue: tabManagerServiceMock },
			],
		});
		repository = TestBed.inject(TeamsRepository);
	});

	it('navigates to an existing team builder', () => {
		vi.spyOn(repository.store, 'getObjectById$$$').mockReturnValue(of({ id: 'team-1', name: 'Team', config: {} }));

		repository.goToTeam('team-1');

		expect(routerMock.navigate).toHaveBeenCalledWith(['/', 'host', 'dashboard', 'teams', 'team-1', 'builder']);
	});

	it('does not navigate when the team is missing', () => {
		vi.spyOn(repository.store, 'getObjectById$$$').mockReturnValue(of(null));

		repository.goToTeam('team-1');

		expect(routerMock.navigate).not.toHaveBeenCalled();
	});

	it('navigates to the team list', () => {
		repository.goToTeamList();

		expect(routerMock.navigate).toHaveBeenCalledWith(['/', 'host', 'dashboard', 'teams']);
	});

	it('gets a team with members and roles', () => {
		requestServiceMock.getBasic$.mockReturnValue(of({}));

		repository.getTeamWithMembersAndRoles$('team-1').subscribe();

		expect(requestServiceMock.getBasic$).toHaveBeenCalledWith('/api/teams/team-1/members_with_roles');
	});

	it('adds a user to a team with the default member role', () => {
		requestServiceMock.getBasic$.mockReturnValue(of({}));

		repository.addUserToTeam$('team-1', 'user-1').subscribe();

		expect(requestServiceMock.getBasic$).toHaveBeenCalledWith('/api/teams/team-1/add/user-1/member');
	});

	it('removes a user from a team', () => {
		requestServiceMock.getBasic$.mockReturnValue(of({}));

		repository.removeUserFromTeam$('team-1', 'user-1').subscribe();

		expect(requestServiceMock.getBasic$).toHaveBeenCalledWith('/api/teams/team-1/remove/user-1');
	});

	it('changes a user role', () => {
		requestServiceMock.getBasic$.mockReturnValue(of({}));

		repository.changeUserRole$('team-1', 'user-1', 'admin').subscribe();

		expect(requestServiceMock.getBasic$).toHaveBeenCalledWith('/api/teams/team-1/change_role/user-1/admin');
	});

	it('adds a user by email', () => {
		requestServiceMock.post$.mockReturnValue(of({}));

		repository.addUserToTeamByEmail$('team-1', 'user@example.com', 'admin').subscribe();

		expect(requestServiceMock.post$).toHaveBeenCalledWith('/api/teams/team-1/add_by_email', {
			user_email: 'user@example.com',
			role: 'admin',
		});
	});

	it('creates a team and assigns the current user as admin', async () => {
		notificationMock.prompt.mockReturnValue({ closed: of({ value: 'New team' }) });
		usersRepositoryMock.currentProfile.mockReturnValue({ id: 'user-1' });
		vi.spyOn(repository.store, 'postObject$').mockReturnValue(of({ result: { data: { id: 'team-id', name: 'New team', config: {} } } }));
		requestServiceMock.getBasic$.mockReturnValue(of({}));

		await new Promise((resolve) => repository.createNewTeam$().subscribe(resolve));

		expect(repository.store.postObject$).toHaveBeenCalledWith({
			id: 'team-id',
			name: 'New team',
			config: {},
		});
		expect(requestServiceMock.getBasic$).toHaveBeenCalledWith('/api/teams/team-id/add/user-1/admin');
	});

	it('does not create a team when prompt is cancelled', async () => {
		notificationMock.prompt.mockReturnValue({ closed: of(null) });
		const postSpy = vi.spyOn(repository.store, 'postObject$');

		await new Promise((resolve) => repository.createNewTeam$().subscribe(resolve));

		expect(postSpy).not.toHaveBeenCalled();
	});

	it('changes team owner', () => {
		requestServiceMock.put$.mockReturnValue(of({}));

		repository.changeTeamOwner('team-1', 'user-2').subscribe();

		expect(requestServiceMock.put$).toHaveBeenCalledWith('/api/teams/team-1/change_owner/user-2', {});
	});
});
