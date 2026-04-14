import { Dialog } from '@angular/cdk/dialog';
import { FoldersRepository } from '@foundation/folders/state';
import { TwTeamIcon } from '@foundation/icons';
import { AccessShareModalComponent } from '@foundation/shared/access';
import { defineExplorerResource, ExplorerResourceDefinition } from '@foundation/shared/explorer';
import { Team } from '@foundation/teams/models';
import { TeamsRepository } from '@foundation/teams/state';
import { map, of, switchMap } from 'rxjs';
import { ExplorerTeamPreviewComponent } from './explorer-team-preview/explorer-team-preview.component';

export function createTeamExplorerResourceDefinition(teamsRepo: TeamsRepository, foldersRepo: FoldersRepository, dialog: Dialog): ExplorerResourceDefinition<Team> {
	return defineExplorerResource<Team>({
		kind: 'team',
		onShare: (r) => dialog.open(AccessShareModalComponent, { data: { resourceId: r.id, resourceKind: 'team' } }),
		load: (id) => teamsRepo.store.getObjectByIdPullOnce$$$(id).$,
		getName: (r) => r.name || 'Unknown team',
		iconComponent: TwTeamIcon,
		previewComponent: ExplorerTeamPreviewComponent,
		actions: [{ label: 'Manage Team', onClick: (r) => window.open('/host/dashboard/teams/' + r.id + '/builder', '_blank'), styleClass: 'btn-outline btn-info' }],
		createAction: {
			label: 'New Team',
			iconComponent: TwTeamIcon,
			onClick: (folderId) =>
				teamsRepo.createNewTeam$().pipe(
					switchMap((res) => {
						const teamId = res?.result?.team_id;
						if (teamId && folderId) {
							return foldersRepo.addResourceToFolder(folderId, 'team', teamId).pipe(map(() => teamId));
						}
						return of(teamId);
					}),
					map((teamId) => {
						if (teamId) {
							window.open('/host/dashboard/teams/' + teamId + '/builder', '_blank');
						}
					})
				),
		},
	});
}
