import { TranslationsRepository } from '@foundation/translations/state';
import { TranslationService } from '@foundation/translations/services';
import { TranslationTableComponent } from '@foundation/translations/ui';
import { TranslatePipe, TranslateDirective } from '@foundation/translations/services';
import { NotificationService } from '@foundation/notification';
import { Team } from '@foundation/teams/models';
import { TeamsRepository } from '@foundation/teams/state';
import { TeamTableComponent } from '@foundation/teams/ui';
import { UsersRepository } from '@foundation/users/state';

import { ChangeDetectionStrategy, Component, inject, model } from '@angular/core';
import { Router } from '@angular/router';
import { of, switchMap, tap } from 'rxjs';
import { v4 as uuidv4 } from 'uuid';

@Component({
	selector: 'lib-team-list-page',
	standalone: true,
	imports: [
    TranslateDirective,
    TeamTableComponent
],
	templateUrl: './team-list-page.component.html',
	styleUrl: './team-list-page.component.css',
	changeDetection: ChangeDetectionStrategy.OnPush,
	host: { class: 'dashboard-page-host' },
})
export class TeamListPageComponent {
	private _translationService = inject(TranslationService);
	private _notificationService = inject(NotificationService);
	private _router = inject(Router);

	private _teamsRepository = inject(TeamsRepository);
	private _usersRepository = inject(UsersRepository);

	teams = model<(Team | null)[]>([]);

	public createNewTeam() {
		return this._teamsRepository
			.createNewTeam$()
			.pipe(
				tap((r: any) => {
					if (r?.result?.team_id) {
						this._router.navigateByUrl('/host/dashboard/teams/' + r.result.team_id + '/builder');
					} else if (r?.team_id) {
						this._router.navigateByUrl('/host/dashboard/teams/' + r.team_id + '/builder');
					}
				})
			)
			.subscribe();
	}

	public goToTeam(teamId: string) {
		this._teamsRepository.goToTeam(teamId);
	}
}
