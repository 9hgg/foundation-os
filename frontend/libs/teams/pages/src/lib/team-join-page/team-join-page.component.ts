import { TranslationService, TranslateDirective } from '@foundation/translations/services';
import { TeamsRepository } from '@foundation/teams/state';
import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { catchError, of, tap } from 'rxjs';

@Component({
	selector: 'lib-team-join-page',
	imports: [RouterModule, TranslateDirective],
	templateUrl: './team-join-page.component.html',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TeamJoinPageComponent implements OnInit {
	public readonly t = inject(TranslationService);
	private _teamsRepository = inject(TeamsRepository);
	private _activatedRoute = inject(ActivatedRoute);
	private _router = inject(Router);

	readonly isClaiming = signal(true);
	readonly joinedTeamId = signal<string | null>(null);
	readonly joinedTeamName = signal<string | null>(null);
	readonly joinedRole = signal<string | null>(null);
	readonly errorTitle = signal<string | null>(null);
	readonly errorDescription = signal<string | null>(null);

	private _i18nNoTokenTitle = this.t.prep('Nothing to accept');
	private _i18nNoTokenDescription = this.t.prep('This page needs the link from your invitation email.');
	private _i18nUnknownErrorTitle = this.t.prep('Something went wrong');
	private _i18nUnknownErrorDescription = this.t.prep('Please try again in a few seconds.');

	ngOnInit() {
		// The route sits behind the host guard, so anyone landing here is signed in: sending them
		// to log in and back preserved the token in the query string on the way.
		const token = this._activatedRoute.snapshot.queryParams['token'];
		if (!token) {
			this.isClaiming.set(false);
			this.errorTitle.set(this._i18nNoTokenTitle());
			this.errorDescription.set(this._i18nNoTokenDescription());
			return;
		}

		this._teamsRepository
			.claimTeamInvitation$(token)
			.pipe(
				catchError(() => {
					this.isClaiming.set(false);
					this.errorTitle.set(this._i18nUnknownErrorTitle());
					this.errorDescription.set(this._i18nUnknownErrorDescription());
					return of(null);
				}),
				tap((response) => {
					if (!response) return;
					this.isClaiming.set(false);
					if (response.error) {
						this.errorTitle.set(response.error.title);
						this.errorDescription.set(response.error.description ?? '');
						return;
					}
					if (!response.result) {
						this.errorTitle.set(this._i18nUnknownErrorTitle());
						this.errorDescription.set(this._i18nUnknownErrorDescription());
						return;
					}
					this.joinedTeamId.set(response.result.teamId);
					this.joinedTeamName.set(response.result.teamName ?? null);
					this.joinedRole.set(response.result.role);
				})
			)
			.subscribe();
	}

	goToTeam() {
		const teamId = this.joinedTeamId();
		if (!teamId) return;
		this._router.navigate(['/', 'host', 'dashboard', 'teams', teamId, 'builder']);
	}

	goToDashboard() {
		this._router.navigate(['/', 'host', 'dashboard']);
	}
}
