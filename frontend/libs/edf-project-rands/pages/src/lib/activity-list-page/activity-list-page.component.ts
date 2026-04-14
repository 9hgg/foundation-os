import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ActivitiesModals } from '@edf/edf-project-rands/modals';
import { Activity } from '@edf/edf-project-rands/models';
import { ActivitiesRepository } from '@edf/edf-project-rands/state';
import { ActivityTableComponent } from '@edf/edf-project-rands/ui';
import { TranslateDirective } from '@foundation/translations/services';
import { of, switchMap, tap } from 'rxjs';
import { v4 as uuidv4 } from 'uuid';

@Component({
	selector: 'lib-activity-list-page',
	standalone: true,
	imports: [TranslateDirective, ActivityTableComponent],
	templateUrl: './activity-list-page.component.html',
	styleUrl: './activity-list-page.component.css',
	changeDetection: ChangeDetectionStrategy.OnPush,
	host: {
		class: 'dashboard-page-host',
	},
})
export class ActivityListPageComponent {
	activitiesRepository = inject(ActivitiesRepository);

	private _activitiesModals = inject(ActivitiesModals);

	public createNew() {
		return this._activitiesModals.openActivityCreateDialog().closed.pipe(
			switchMap((result) => {
				if (!result) return of(null);
				const id = uuidv4();

				const payload: Activity = {
					id: id,
					title: result.title,
					prefix: result.prefix,
					batchId: result.batchId,
					description: result.description,
					finality: result.finality,
					strategicInterests: result.strategicInterests,
					synergies: result.synergies,
					risks: result.risks,
					parades: result.parades,
					priority: result.priority,
					isCorporate: result.isCorporate,
					isConfirmed: result.isConfirmed,
					hidden: false,
					tags: result.tags,
				};

				return this.activitiesRepository.store.postObject$(payload);
			}),
			tap((r) => {
				const newId = r?.result?.data?.id;
				if (newId) this.activitiesRepository.goToActivity(newId);
			})
		).subscribe();
	}
}
