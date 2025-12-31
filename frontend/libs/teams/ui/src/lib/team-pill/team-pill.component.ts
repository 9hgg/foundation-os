import { Team } from '@foundation/teams/models';
import { TeamsRepository } from '@foundation/teams/state';
import { Component, computed, effect, inject, input, model, OnDestroy } from '@angular/core';
import { filter, Subject, take, takeUntil, tap } from 'rxjs';

@Component({
	selector: 'lib-team-pill',
	templateUrl: './team-pill.component.html',
	styleUrl: './team-pill.component.css',
	standalone: true,
})
export class TeamPillComponent implements OnDestroy {
	private _teamsRepository = inject(TeamsRepository);
	private destroyed$ = new Subject<void>();

	maxLength = input<number | null>(30);

	team = input<Team | null>(null);
	teamId = input<string | null>(null);

	teamName = model<string>('');

	teamNameTruncated = computed(() => {
		const title = this.teamName();
		const maxLength = this.maxLength();
		if (maxLength && title.length > maxLength) {
			return title.substring(0, maxLength) + '...';
		}
		return title;
	});

	constructor() {
		effect(() => {
			const teamId = this.teamId();
			const team = this.team();
			const teamId_ = teamId ?? team?.id ?? null;

			if (!teamId_) return;

			this._teamsRepository.store
				.getObjectById$$$(teamId_, true)
				.pipe(
					filter((a) => !!a),
					take(1),
					takeUntil(this.destroyed$),
					tap((m) => {
						this.teamName.set(m.name || 'No title');
					})
				)
				.subscribe();
		});
	}

	ngOnDestroy(): void {
		this.destroyed$.next();
		this.destroyed$.complete();
	}
}
