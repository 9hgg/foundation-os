import { DatePipe, TitleCasePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { convertToUrl } from '@foundation/files/state';
import { Team } from '@foundation/teams/models';
import { TeamsRepository } from '@foundation/teams/state';
import { UsersRepository } from '@foundation/users/state';
import { map, of, switchMap, tap } from 'rxjs';

interface TeamPreviewMember {
	user: {
		id: string;
		email?: string;
		firstName?: string;
		lastName?: string;
		pseudo?: string;
		profilePictureId?: string;
	};
	role: string;
}

interface TeamPreviewMemberDisplay {
	id: string;
	displayName: string;
	secondaryLabel: string;
	avatarUrl: string | null;
	initials: string;
	role: string;
	isOwner: boolean;
}

@Component({
	selector: 'lib-explorer-team-preview',
	imports: [DatePipe, TitleCasePipe],
	changeDetection: ChangeDetectionStrategy.OnPush,
	template: `
		@let team = resource();
		@if (team) {
			<div class="flex h-full flex-col gap-4 p-4">
				<div class="flex flex-col gap-2">
					<h3 class="text-base-content text-lg font-bold">{{ team.name || 'Unnamed team' }}</h3>
					@if (team.config.details) {
						<p class="text-base-content/70 text-sm">{{ team.config.details }}</p>
					}
				</div>
				<div class="bg-base-200/60 rounded-lg p-3">
					<div class="mb-3 flex items-center justify-between gap-3">
						<span class="text-base-content font-medium">Members</span>
						<span class="badge badge-primary badge-sm">{{ teamMembers().length }}</span>
					</div>
					@if (isLoadingMembers()) {
						<div class="text-base-content/60 flex items-center gap-2 text-sm">
							<span class="loading loading-spinner loading-xs"></span>
							<span>Loading members...</span>
						</div>
					} @else if (teamMembers().length > 0) {
						<div class="flex flex-col gap-2">
							@for (teamMemberDisplay of teamMemberDisplays(); track teamMemberDisplay.id) {
								<div class="bg-base-100 flex items-center justify-between gap-3 rounded-lg px-3 py-2">
									<div class="flex min-w-0 items-center gap-3">
										@if (teamMemberDisplay.avatarUrl) {
											<div class="avatar">
												<div class="h-9 w-9 rounded-full">
													<img [src]="teamMemberDisplay.avatarUrl" [alt]="teamMemberDisplay.displayName" />
												</div>
											</div>
										} @else {
											<div class="avatar placeholder">
												<div class="bg-base-300 text-base-content/60 h-9 w-9 rounded-full text-xs font-medium">
													{{ teamMemberDisplay.initials }}
												</div>
											</div>
										}
										<div class="min-w-0">
											<div class="text-base-content truncate text-sm font-medium">
												{{ teamMemberDisplay.displayName }}
											</div>
											<div class="text-base-content/60 truncate text-xs">
												{{ teamMemberDisplay.secondaryLabel }}
											</div>
										</div>
									</div>
									<div class="flex shrink-0 items-center gap-2">
										@if (teamMemberDisplay.isOwner) {
											<span class="badge badge-warning badge-outline badge-xs">Owner</span>
										}
										<span class="badge badge-ghost badge-sm">{{ teamMemberDisplay.role | titlecase }}</span>
									</div>
								</div>
							}
						</div>
					} @else {
						<p class="text-base-content/60 text-sm">No members yet.</p>
					}
				</div>
				<div class="text-base-content/60 flex flex-col gap-2 text-sm">
					@if (team.ownerId) {
						<div class="flex justify-between gap-4">
							<span class="font-medium">Owner</span>
							<span class="truncate">{{ ownerLabel() || team.ownerId }}</span>
						</div>
					}
					@if (team.timeCreated) {
						<div class="flex justify-between">
							<span class="font-medium">Created</span>
							<span>{{ team.timeCreated | date: 'medium' }}</span>
						</div>
					}
					@if (team.timeUpdated) {
						<div class="flex justify-between">
							<span class="font-medium">Updated</span>
							<span>{{ team.timeUpdated | date: 'medium' }}</span>
						</div>
					}
					<div class="flex justify-between gap-4">
						<span class="font-medium">ID</span>
						<span class="truncate font-mono text-xs opacity-60">{{ team.id }}</span>
					</div>
				</div>
			</div>
		}
	`,
})
export class ExplorerTeamPreviewComponent {
	private readonly teamsRepository = inject(TeamsRepository);
	private readonly usersRepository = inject(UsersRepository);

	resource = input<Team | null>(null);
	teamMembers = signal<TeamPreviewMember[]>([]);
	isLoadingMembers = signal(false);
	ownerLabel = signal<string | null>(null);
	teamMemberDisplays = computed<TeamPreviewMemberDisplay[]>(() => {
		const currentTeam = this.resource();
		return this.teamMembers().map((teamMember) => {
			const firstName = teamMember.user.firstName?.trim() ?? '';
			const lastName = teamMember.user.lastName?.trim() ?? '';
			const fullName = `${firstName} ${lastName}`.trim();
			const displayName = fullName || teamMember.user.pseudo || teamMember.user.email || teamMember.user.id;
			const secondaryLabel = teamMember.user.email || teamMember.user.id;
			const avatarUrl = teamMember.user.profilePictureId ? convertToUrl(teamMember.user.profilePictureId, 'thumbnail') : null;
			const initials = displayName
				.split(' ')
				.filter(Boolean)
				.slice(0, 2)
				.map((displayNamePart) => displayNamePart[0]?.toUpperCase() ?? '')
				.join('') || 'U';

			return {
				id: teamMember.user.id,
				displayName,
				secondaryLabel,
				avatarUrl,
				initials,
				role: teamMember.role,
				isOwner: currentTeam?.ownerId === teamMember.user.id,
			};
		});
	});

	constructor() {
		toObservable(this.resource)
			.pipe(
				tap((team) => {
					this.isLoadingMembers.set(!!team);
					if (!team) {
						this.teamMembers.set([]);
					}
				}),
				switchMap((team) => {
					if (!team) {
						return of<TeamPreviewMember[]>([]);
					}
					return this.teamsRepository.getTeamWithMembersAndRoles$(team.id).pipe(map((response) => response.result?.members ?? []));
				}),
				tap(() => this.isLoadingMembers.set(false)),
				takeUntilDestroyed()
			)
			.subscribe((teamMembers) => {
				this.teamMembers.set(teamMembers);
			});

		toObservable(this.resource)
			.pipe(
				tap((team) => {
					if (!team?.ownerId) {
						this.ownerLabel.set(null);
					}
				}),
				switchMap((team) => {
					if (!team?.ownerId) {
						return of<string | null>(null);
					}
					return this.usersRepository.getUserPublicDetails$(team.ownerId).pipe(map((ownerPublicDetails) => ownerPublicDetails?.publicName || ownerPublicDetails?.starredEmail || team.ownerId || null));
				}),
				takeUntilDestroyed()
			)
			.subscribe((ownerLabel) => {
				this.ownerLabel.set(ownerLabel);
			});
	}
}
