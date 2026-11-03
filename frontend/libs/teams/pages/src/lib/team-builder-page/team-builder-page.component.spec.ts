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
			pullObject$: vi.fn(),
			save: vi.fn(),
		},
		getTeamWithMembersAndRoles$: vi.fn(),
		inviteUserToTeamByEmail$: vi.fn(),
		revokeTeamInvitation$: vi.fn(),
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
		teamsRepositoryMock.store.pullObject$.mockReturnValue(of({ result: { data: team } }));
		teamsRepositoryMock.getTeamWithMembersAndRoles$.mockReturnValue(of({ result: { members: [] } }));
		teamsRepositoryMock.inviteUserToTeamByEmail$.mockReturnValue(of({ result: {} }));
		teamsRepositoryMock.revokeTeamInvitation$.mockReturnValue(of({ result: {} }));
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

	it('invites a member by email and resets the form', () => {
		component.newMemberEmail.set(' new@example.com ');
		component.newMemberRole.set('admin');
		const reloadSpy = vi.spyOn(component, 'reloadTeam').mockImplementation(() => undefined);

		component.inviteMember();

		expect(teamsRepositoryMock.inviteUserToTeamByEmail$).toHaveBeenCalledWith('team-1', 'new@example.com', 'admin');
		expect(notificationMock.snackSuccess).toHaveBeenCalledWith('Invitation sent to new@example.com');
		expect(reloadSpy).toHaveBeenCalledWith('team-1');
		expect(component.newMemberEmail()).toBe('');
		expect(component.newMemberRole()).toBe('member');
	});

	it('does not claim anyone joined -- the invitation is only sent', () => {
		const loadMembersSpy = vi.spyOn(component, 'loadTeamMembers').mockImplementation(() => undefined);
		component.newMemberEmail.set('new@example.com');

		component.inviteMember();

		expect(loadMembersSpy).not.toHaveBeenCalled();
	});

	it('shows an error when inviting a member fails', () => {
		component.newMemberEmail.set('new@example.com');
		teamsRepositoryMock.inviteUserToTeamByEmail$.mockReturnValue(of({ error: { title: 'Already exists' } }));

		component.inviteMember();

		expect(notificationMock.snackError).toHaveBeenCalledWith('Failed to invite member: Already exists');
		expect(component.isSendingInvitation()).toBe(false);
	});

	it('shows a network error when inviting a member throws', () => {
		component.newMemberEmail.set('new@example.com');
		teamsRepositoryMock.inviteUserToTeamByEmail$.mockReturnValue(throwError(() => new Error('offline')));

		component.inviteMember();

		expect(notificationMock.snackError).toHaveBeenCalledWith('Failed to invite member: Network error');
		expect(component.isSendingInvitation()).toBe(false);
	});

	it('does not invite without an email', () => {
		component.newMemberEmail.set('   ');

		component.inviteMember();

		expect(teamsRepositoryMock.inviteUserToTeamByEmail$).not.toHaveBeenCalled();
	});

	it('reads the invitations off the team rather than asking for them again', () => {
		const inAWeek = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();
		const lastWeek = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
		component.team.set({
			...team,
			config: {
				invitations: {
					'invitation-2': { id: 'invitation-2', email: 'zoe@example.com', role: 'member', createdAt: '', expiresAt: lastWeek },
					'invitation-1': { id: 'invitation-1', email: 'alex@example.com', role: 'admin', createdAt: '', expiresAt: inAWeek },
				},
			},
		});

		expect(component.pendingInvitations().map((invitation) => invitation.email)).toEqual(['alex@example.com', 'zoe@example.com']);
		expect(component.pendingInvitations().map((invitation) => invitation.expired)).toEqual([false, true]);
	});

	it('sends a lapsed invitation again with the role it already carried', () => {
		const invitation = { id: 'invitation-1', email: 'new@example.com', role: 'admin', createdAt: '', expiresAt: '' };

		component.resendInvitation(invitation);

		expect(teamsRepositoryMock.inviteUserToTeamByEmail$).toHaveBeenCalledWith('team-1', 'new@example.com', 'admin');
	});

	it('revokes an invitation once confirmed, and pulls the team again', () => {
		const invitation = { id: 'invitation-1', email: 'new@example.com', role: 'member', createdAt: '', expiresAt: '' };
		const reloadSpy = vi.spyOn(component, 'reloadTeam').mockImplementation(() => undefined);

		component.revokeInvitation(invitation);

		expect(teamsRepositoryMock.revokeTeamInvitation$).toHaveBeenCalledWith('team-1', 'invitation-1');
		expect(reloadSpy).toHaveBeenCalledWith('team-1');
	});

	it('leaves an invitation alone when the confirmation is dismissed', () => {
		notificationMock.confirm.mockReturnValue({ closed: of(false) });
		const invitation = { id: 'invitation-1', email: 'new@example.com', role: 'member', createdAt: '', expiresAt: '' };

		component.revokeInvitation(invitation);

		expect(teamsRepositoryMock.revokeTeamInvitation$).not.toHaveBeenCalled();
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
