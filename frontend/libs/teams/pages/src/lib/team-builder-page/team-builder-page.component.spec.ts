import { NO_ERRORS_SCHEMA } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { NotificationService } from '@foundation/notification';
import { TeamsRepository } from '@foundation/teams/state';
import { UsersRepository } from '@foundation/users/state';
import { of, throwError } from 'rxjs';
import { TeamBuilderPageComponent } from './team-builder-page.component';

describe('TeamBuilderPageComponent', () => {
	let component: TeamBuilderPageComponent;
	const team = { id: 'team-1', name: 'Team', config: {}, ownerId: 'owner-1' };
	const teamsRepositoryMock = {
		store: {
			getObjectById$$$: vi.fn(),
			save: vi.fn(),
		},
		getTeamWithMembersAndRoles$: vi.fn(),
		addUserToTeamByEmail$: vi.fn(),
		changeUserRole$: vi.fn(),
		removeUserFromTeam$: vi.fn(),
		addUserToTeam$: vi.fn(),
		changeTeamOwner: vi.fn(),
	};
	const usersRepositoryMock = {
		currentProfile: vi.fn(),
		getUserPublicDetails$: vi.fn(),
	};
	const notificationMock = {
		snackError: vi.fn(),
		snackSuccess: vi.fn(),
		confirm: vi.fn(),
	};

	beforeEach(async () => {
		vi.clearAllMocks();
		teamsRepositoryMock.store.getObjectById$$$.mockReturnValue({ $: of(team) });
		teamsRepositoryMock.getTeamWithMembersAndRoles$.mockReturnValue(of({ result: { members: [] } }));
		teamsRepositoryMock.addUserToTeamByEmail$.mockReturnValue(of({ result: {} }));
		teamsRepositoryMock.changeUserRole$.mockReturnValue(of({ result: {} }));
		teamsRepositoryMock.removeUserFromTeam$.mockReturnValue(of({ result: {} }));
		teamsRepositoryMock.addUserToTeam$.mockReturnValue(of({ result: {} }));
		teamsRepositoryMock.changeTeamOwner.mockReturnValue(of({ result: {} }));
		usersRepositoryMock.currentProfile.mockReturnValue({ id: 'user-1' });
		usersRepositoryMock.getUserPublicDetails$.mockReturnValue(of({ publicName: 'Owner', starredEmail: 'owner@example.com' }));
		notificationMock.confirm.mockReturnValue({ closed: of(true) });

		await TestBed.configureTestingModule({
			imports: [TeamBuilderPageComponent],
			providers: [
				{ provide: TeamsRepository, useValue: teamsRepositoryMock },
				{ provide: UsersRepository, useValue: usersRepositoryMock },
				{ provide: NotificationService, useValue: notificationMock },
			],
			schemas: [NO_ERRORS_SCHEMA],
		})
			.overrideComponent(TeamBuilderPageComponent, { set: { imports: [], template: '' } })
			.compileComponents();

		const fixture = TestBed.createComponent(TeamBuilderPageComponent);
		component = fixture.componentInstance;
		component.team.set(team);
	});

	it('should create', () => {
		expect(component).toBeTruthy();
	});

	it('computes current user and membership flags', () => {
		component.teamMembers.set([{ user: { id: 'user-1', email: 'me@example.com' }, role: 'admin' }]);

		expect(component.currentUserId()).toBe('user-1');
		expect(component.isCurrentUserInTeam()).toBe(true);
		expect(component.isCurrentUserAdmin()).toBe(true);
		expect(component.canCurrentUserMakeOwner()).toBe(false);
	});

	it('detects when the owner is a team member', () => {
		component.teamMembers.set([{ user: { id: 'owner-1' }, role: 'member' }]);

		expect(component.isOwnerTeamMember()).toBe(true);
	});

	it('updates and saves the team name', () => {
		component.updateName('Renamed team');

		expect(team.name).toBe('Renamed team');
		expect(teamsRepositoryMock.store.save).toHaveBeenCalledWith(team);
	});

	it('does not update name when no team is loaded', () => {
		component.team.set(null);

		component.updateName('Ignored');

		expect(teamsRepositoryMock.store.save).not.toHaveBeenCalled();
	});

	it('loads team members and clears the loading flag', () => {
		const members = [{ user: { id: 'user-1' }, role: 'member' }];
		teamsRepositoryMock.getTeamWithMembersAndRoles$.mockReturnValue(of({ result: { members } }));

		component.loadTeamMembers('team-1');

		expect(component.teamMembers()).toEqual(members);
		expect(component.isLoadingMembers()).toBe(false);
	});

	it('adds a member by email and resets the form', () => {
		component.newMemberEmail.set(' new@example.com ');
		component.newMemberRole.set('admin');
		const loadSpy = vi.spyOn(component, 'loadTeamMembers').mockImplementation(() => undefined);

		component.addMember();

		expect(teamsRepositoryMock.addUserToTeamByEmail$).toHaveBeenCalledWith('team-1', 'new@example.com', 'admin');
		expect(notificationMock.snackSuccess).toHaveBeenCalledWith('Successfully added new@example.com to the team');
		expect(loadSpy).toHaveBeenCalledWith('team-1');
		expect(component.newMemberEmail()).toBe('');
		expect(component.newMemberRole()).toBe('member');
	});

	it('shows an error when adding a member fails', () => {
		component.newMemberEmail.set('new@example.com');
		teamsRepositoryMock.addUserToTeamByEmail$.mockReturnValue(of({ error: { title: 'Already exists' } }));

		component.addMember();

		expect(notificationMock.snackError).toHaveBeenCalledWith('Failed to add member: Already exists');
	});

	it('shows a network error when adding a member throws', () => {
		component.newMemberEmail.set('new@example.com');
		teamsRepositoryMock.addUserToTeamByEmail$.mockReturnValue(throwError(() => new Error('offline')));

		component.addMember();

		expect(notificationMock.snackError).toHaveBeenCalledWith('Failed to add member: Network error');
	});

	it('does not add a member without an email', () => {
		component.newMemberEmail.set('   ');

		component.addMember();

		expect(teamsRepositoryMock.addUserToTeamByEmail$).not.toHaveBeenCalled();
	});

	it('changes a member role and reloads members', () => {
		const loadSpy = vi.spyOn(component, 'loadTeamMembers').mockImplementation(() => undefined);

		component.changeRole('user-2', 'admin');

		expect(teamsRepositoryMock.changeUserRole$).toHaveBeenCalledWith('team-1', 'user-2', 'admin');
		expect(loadSpy).toHaveBeenCalledWith('team-1');
	});

	it('removes a confirmed member and reloads members', () => {
		const loadSpy = vi.spyOn(component, 'loadTeamMembers').mockImplementation(() => undefined);

		component.removeMember('user-2');

		expect(teamsRepositoryMock.removeUserFromTeam$).toHaveBeenCalledWith('team-1', 'user-2');
		expect(loadSpy).toHaveBeenCalledWith('team-1');
	});

	it('does not remove a member when confirmation is cancelled', () => {
		notificationMock.confirm.mockReturnValue({ closed: of(false) });

		component.removeMember('user-2');

		expect(teamsRepositoryMock.removeUserFromTeam$).not.toHaveBeenCalled();
	});

	it('adds the current user as admin', () => {
		const loadSpy = vi.spyOn(component, 'loadTeamMembers').mockImplementation(() => undefined);

		component.addMyself();

		expect(teamsRepositoryMock.addUserToTeam$).toHaveBeenCalledWith('team-1', 'user-1', 'admin');
		expect(notificationMock.snackSuccess).toHaveBeenCalledWith('You have been added to the team!');
		expect(loadSpy).toHaveBeenCalledWith('team-1');
	});

	it('changes team owner and reloads members on success', () => {
		const loadSpy = vi.spyOn(component, 'loadTeamMembers').mockImplementation(() => undefined);

		component.changeTeamOwner('user-2');

		expect(teamsRepositoryMock.changeTeamOwner).toHaveBeenCalledWith('team-1', 'user-2');
		expect(notificationMock.snackSuccess).toHaveBeenCalledWith('Team owner changed successfully');
		expect(loadSpy).toHaveBeenCalledWith('team-1');
	});

	it('shows an error when owner change fails', () => {
		teamsRepositoryMock.changeTeamOwner.mockReturnValue(of({ error: { title: 'Forbidden' } }));

		component.changeTeamOwner('user-2');

		expect(notificationMock.snackError).toHaveBeenCalledWith('Failed to change owner: Forbidden');
	});

	it('shows a network error when owner change throws', () => {
		teamsRepositoryMock.changeTeamOwner.mockReturnValue(throwError(() => new Error('offline')));

		component.changeTeamOwner('user-2');

		expect(notificationMock.snackError).toHaveBeenCalledWith('Failed to change owner: Network error');
	});

	it('adds the current owner as an admin member', () => {
		component.teamOwnerPublicDetails.set({ id: 'owner-1', nameToUse: 'Owner' });
		const loadSpy = vi.spyOn(component, 'loadTeamMembers').mockImplementation(() => undefined);

		component.addOwnerAsTeamMember();

		expect(teamsRepositoryMock.addUserToTeam$).toHaveBeenCalledWith('team-1', 'owner-1', 'admin');
		expect(notificationMock.snackSuccess).toHaveBeenCalledWith('Team owner has been added as an admin member!');
		expect(loadSpy).toHaveBeenCalledWith('team-1');
	});
});
