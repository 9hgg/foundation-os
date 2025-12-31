import { GenericRepository } from '@foundation/table/state';
import { RequestResponse } from '@foundation/network/services';
import { Team } from '@foundation/teams/models';
import { Injectable, inject } from '@angular/core';
import { Observable, of, switchMap, tap } from 'rxjs';

import { UsersRepository } from '@foundation/users/state';
import { v4 as uuidv4 } from 'uuid';

@Injectable({ providedIn: 'root' })
export class TeamsRepository extends GenericRepository<Team> {
	private _usersRepository = inject(UsersRepository);
	private _i18n_createNewTeamSentence = this._translationService.prep('Give a name to your new team:');

	constructor() {
		super('team', '/api/teams');
	}

	public goToTeam(teamId: string): void {
		this.store.getObjectById$$$(teamId, true).subscribe((team) => {
			if (!team) {
				console.error('Team not found:', teamId);
				return;
			}
			this._router.navigate(['/', 'host', 'dashboard', 'teams', teamId, 'builder']);
		});
	}

	public goToTeamList(): void {
		this._router.navigate(['/', 'host', 'dashboard', 'teams']);
	}

	// Team member management methods
	public getTeamWithMembersAndRoles$(teamId: string): Observable<
		RequestResponse<{
			team: Team;
			members: Array<{
				user: {
					id: string;
					email?: string;
					firstName?: string;
					lastName?: string;
					pseudo?: string;
					profilePictureId?: string;
				};
				role: string;
			}>;
		}>
	> {
		return this._requestService.getBasic$(`/api/teams/${teamId}/members_with_roles`);
	}

	public addUserToTeam$(
		teamId: string,
		userId: string,
		role: string = 'member'
	): Observable<
		RequestResponse<{
			team_id: string;
			user_id: string;
			role: string;
		}>
	> {
		return this._requestService.getBasic$(`/api/teams/${teamId}/add/${userId}/${role}`);
	}

	public removeUserFromTeam$(
		teamId: string,
		userId: string
	): Observable<
		RequestResponse<{
			team_id: string;
			user_id: string;
		}>
	> {
		return this._requestService.getBasic$(`/api/teams/${teamId}/remove/${userId}`);
	}

	public changeUserRole$(
		teamId: string,
		userId: string,
		newRole: string
	): Observable<
		RequestResponse<{
			team_id: string;
			user_id: string;
			new_role: string;
		}>
	> {
		return this._requestService.getBasic$(`/api/teams/${teamId}/change_role/${userId}/${newRole}`);
	}

	public addUserToTeamByEmail$(
		teamId: string,
		userEmail: string,
		role: string = 'member'
	): Observable<
		RequestResponse<{
			team_id: string;
			user_id: string;
			role: string;
		}>
	> {
		return this._requestService.post$(`/api/teams/${teamId}/add_by_email`, {
			user_email: userEmail,
			role: role,
		});
	}

	public createNewTeam$() {
		return this._notificationService.prompt(undefined, this._i18n_createNewTeamSentence(), { width: '300px' }).closed.pipe(
			switchMap((promptResult: any) => {
				if (!promptResult) return of(null);
				const teamName = promptResult.value;

				if (!teamName) return of(null);

				const teamId = uuidv4();
				const team: Team = {
					id: teamId,
					name: teamName,
					config: {},
				};

				return this.store.postObject$(team);
			}),
			switchMap((r: any) => {
				const team = r?.result?.data;
				// Use currentProfile from usersRepository
				const userId = this._usersRepository.currentProfile()?.id;
				if (team && userId) {
					return this.addUserToTeam$(team.id, userId, 'admin');
				}
				return of(null);
			})
		);
	}

	public changeTeamOwner(
		teamId: string,
		newOwnerId: string
	): Observable<
		RequestResponse<{
			team_id: string;
			old_owner_id: string;
			new_owner_id: string;
		}>
	> {
		return this._requestService.put$(`/api/teams/${teamId}/change_owner/${newOwnerId}`, {});
	}
}
