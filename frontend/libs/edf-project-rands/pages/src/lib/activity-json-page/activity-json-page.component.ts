import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, effect, inject, model } from '@angular/core';
import { BehaviorSubjectReplayedProxied } from '@foundation/utils';
import { Activity } from '@edf/edf-project-rands/models';
import { ActivitiesRepository } from '@edf/edf-project-rands/state';
import { of } from 'rxjs';

@Component({
	selector: 'lib-activity-json-page',
	standalone: true,
	imports: [CommonModule],
	templateUrl: './activity-json-page.component.html',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ActivityJsonPageComponent {
	private _activitiesRepository = inject(ActivitiesRepository);

	public activityId = model<string | null>(null);

	activity$$$ = new BehaviorSubjectReplayedProxied<string | null, Activity | null>((id: string | null) => {
		return id ? this._activitiesRepository.store.getObjectById$$$(id).$ : of(null);
	}, null);

	constructor() {
		effect(() => {
			const id = this.activityId();
			this.activity$$$.next(id);
		});
	}
}
