import { convertToUrl } from '@foundation/files/state';
import { TranslationsRepository } from '@foundation/translations/state';
import { TranslationService } from '@foundation/translations/services';
import { TranslationTableComponent } from '@foundation/translations/ui';
import { TranslatePipe, TranslateDirective } from '@foundation/translations/services';
import { NotificationService } from '@foundation/notification';
import { Team } from '@foundation/teams/models';
import { TeamsRepository } from '@foundation/teams/state';
import { UsersRepository } from '@foundation/users/state';
import { BehaviorSubjectReplayedProxied } from '@foundation/utils';
import { CdkMenuModule } from '@angular/cdk/menu';
import { PortalModule } from '@angular/cdk/portal';
import { CommonModule, TitleCasePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, inject, inject as injectUserRepo, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { of, tap, filter, take } from 'rxjs';

@Component({
	selector: 'lib-team-builder-page',
	standalone: true,
	imports: [CommonModule, FormsModule, TranslateDirective, RouterModule, CdkMenuModule, PortalModule, TitleCasePipe],
	templateUrl: './team-builder-page.component.html',
	styleUrls: ['./team-builder-page.component.css'],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TeamBuilderPageComponent {
	private _notificationService = inject(NotificationService);
	private _teamsRepository = inject(TeamsRepository);
	private _usersRepository = injectUserRepo(UsersRepository);

	public teamId = input<string | null>(null);
	public convertToUrl = convertToUrl;
	team$$$ = new BehaviorSubjectReplayedProxied<string | null, Team | null>((id: string | null) => {
		return id ? this._teamsRepository.store.getObjectById$$$(id, true).$ : of(null);
	}, null);

	// Team members management
	teamMembers = signal<
		Array<{
			user: {
				id: string;
				email?: string;
				firstName?: string;
				lastName?: string;
				pseudo?: string;
				profilePictureId?: string;
			};
			role: string;
		}>
	>([]);
	isLoadingMembers = signal(false);

	newMemberEmail = signal('');
	newMemberRole = signal('member');
	availableRoles = ['admin', 'member'];

	// Owner details fetched separately from membership
	teamOwnerPublicDetails = signal<{ id: string; nameToUse: string; publicName?: string; starredEmail?: string } | null>(null);

	currentUserId = computed(() => {
		const currentProfile = this._usersRepository.currentProfile();
		return currentProfile?.id ?? null;
	});

	// // Current owner info (independent of team membership)
	// currentOwner = computed(() => {
	// 	const team = this.team();
	// 	const ownerDetails = this.teamOwnerPublicDetails();

	// 	if (!team?.ownerId || !ownerDetails) return null;

	// 	return {
	// 		id: team.ownerId,
	// 		name: ownerDetails.publicName || ownerDetails.starredEmail || 'Unknown Owner',
	// 	};
	// });

	// Check if the owner is also a team member
	isOwnerTeamMember = computed(() => {
		const team = this.team();
		const members = this.teamMembers();

		if (!team?.ownerId) return false;

		return members.some((member) => member.user.id === team.ownerId);
	});

	isCurrentUserInTeam = computed(() => {
		const userId = this.currentUserId();
		return this.teamMembers().some((m) => m.user.id === userId);
	});

	// Check if current user is admin
	isCurrentUserAdmin = computed(() => {
		const userId = this.currentUserId();
		const members = this.teamMembers();
		const currentUserMember = members.find((m) => m.user.id === userId);
		const team = this.team();
		return currentUserMember?.role === 'admin' || team?.ownerId === userId;
	});

	// Check if current user can make others owner (must be admin AND either current owner OR no owner set)
	canCurrentUserMakeOwner = computed(() => {
		const isAdmin = this.isCurrentUserAdmin();

		const team = this.team();
		if (!team) return false;
		const currentUserId = this.currentUserId();
		if (!currentUserId) return false;
		const currentOwnerId = team.ownerId;
		// User can make others owner if they are owner OR they are admin AND (they are current owner OR no owner is set)
		return currentOwnerId === currentUserId || (!currentOwnerId && isAdmin);
	});

	team = signal<Team | null>(null);

	constructor() {
		// reacts to teamId input changes
		effect(() => {
			const teamId = this.teamId();
			this.team$$$.next(teamId);

			// Load team members when team changes
			if (teamId) {
				this.loadTeamMembers(teamId);
			}
		});

		// convert team$$$ to a signal
		this.team$$$
			.pipe(
				tap((team) => {
					this.team.set(team);
				})
			)
			.subscribe();

		// Fetch owner details when ownerId changes
		effect(() => {
			const team = this.team();
			const ownerId = team?.ownerId;

			if (!ownerId) {
				this.teamOwnerPublicDetails.set(null);
				return;
			}

			this._usersRepository
				.getUserPublicDetails$(ownerId)
				.pipe(
					filter((details) => !!details),
					take(1),
					tap((details) => {
						// this.teamOwnerPublicDetails.set(details);
						this.teamOwnerPublicDetails.set({
							id: ownerId,
							nameToUse: details.publicName || details.starredEmail || 'Unknown Owner',
							publicName: details.publicName,
							starredEmail: details.starredEmail,
						});
					})
				)
				.subscribe();
		});
	}

	updateName(name: string) {
		const team = this.team();
		if (!team) return;
		team.name = name;
		this._teamsRepository.store.save(team);
	}

	loadTeamMembers(teamId: string) {
		this.isLoadingMembers.set(true);
		this._teamsRepository
			.getTeamWithMembersAndRoles$(teamId)
			.pipe(
				tap((response) => {
					if (response.result) {
						this.teamMembers.set(response.result.members);
					}
					this.isLoadingMembers.set(false);
				})
			)
			.subscribe();
	}

	addMember() {
		const team = this.team();
		const email = this.newMemberEmail().trim();
		const role = this.newMemberRole();

		if (!team || !email) return;

		// Add the user to the team by email in one request
		this._teamsRepository
			.addUserToTeamByEmail$(team.id, email, role)
			.pipe(
				tap((response) => {
					if (response.error) {
						this._notificationService.snackError(`Failed to add member: ${response.error.title}`);
						return;
					}

					// Success - reload team members and clear form
					this._notificationService.snackSuccess(`Successfully added ${email} to the team`);
					this.loadTeamMembers(team.id);
					this.newMemberEmail.set('');
					this.newMemberRole.set('member');
				})
			)
			.subscribe({
				error: (error) => {
					console.error('Error adding member:', error);
					this._notificationService.snackError('Failed to add member: Network error');
				},
			});
	}

	changeRole(userId: string, newRole: string) {
		const team = this.team();
		if (!team) return;

		this._teamsRepository.changeUserRole$(team.id, userId, newRole).subscribe(() => {
			this.loadTeamMembers(team.id);
		});
	}

	removeMember(userId: string) {
		const team = this.team();
		if (!team) return;

		this._notificationService
			.confirm(`Are you sure you want to remove this member?`, 'Remove users', {
				confirmButtonText: 'Remove',
				// cancelButtonText: 'Cancel',
			})
			.closed.subscribe((confirmed) => {
				if (!confirmed) return;

				this._teamsRepository.removeUserFromTeam$(team.id, userId).subscribe(() => {
					this.loadTeamMembers(team.id);
				});
			});
	}

	addMyself() {
		const team = this.team();
		const userId = this.currentUserId();
		if (!team || !userId) return;
		this._teamsRepository.addUserToTeam$(team.id, userId, 'admin').subscribe(() => {
			this._notificationService.snackSuccess('You have been added to the team!');
			this.loadTeamMembers(team.id);
		});
	}

	changeTeamOwner(newOwnerId: string) {
		const team = this.team();
		if (!team) return;

		this._teamsRepository
			.changeTeamOwner(team.id, newOwnerId)
			.pipe(
				tap((response) => {
					if (response.error) {
						this._notificationService.snackError(`Failed to change owner: ${response.error.title}`);
						return;
					}

					// Success - reload team data
					this._notificationService.snackSuccess('Team owner changed successfully');
					this.loadTeamMembers(team.id);
				})
			)
			.subscribe({
				error: (error) => {
					console.error('Error changing team owner:', error);
					this._notificationService.snackError('Failed to change owner: Network error');
				},
			});
	}

	addOwnerAsTeamMember() {
		const team = this.team();
		const currentOwner = this.teamOwnerPublicDetails();

		if (!team || !currentOwner) return;

		this._teamsRepository.addUserToTeam$(team.id, currentOwner.id, 'admin').subscribe(() => {
			this._notificationService.snackSuccess('Team owner has been added as an admin member!');
			this.loadTeamMembers(team.id);
		});
	}
}
