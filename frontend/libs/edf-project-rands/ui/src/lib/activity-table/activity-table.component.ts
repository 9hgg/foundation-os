/* eslint-disable @angular-eslint/prefer-inject */
import { Activity } from '@edf/edf-project-rands/models';
import { ActivitiesRepository } from '@edf/edf-project-rands/state';
import { BehaviorType, RepositoryTableComponent } from '@foundation/table/ui';
import { TranslateDirective, TranslatePipe } from '@foundation/translations/services';
import { CdkMenu, CdkMenuItem, CdkMenuModule } from '@angular/cdk/menu';
import { CommonModule } from '@angular/common';
import { Attribute, ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { switchMap } from 'rxjs';
import { AccessService } from '@foundation/shared/access';

@Component({
	selector: 'lib-activity-table',
	standalone: true,
	imports: [
		CommonModule,
		TranslateDirective,
		TranslatePipe,
		ReactiveFormsModule,
		FormsModule,
		CdkMenuModule,
		CdkMenu,
		CdkMenuItem,
	],
	templateUrl: './activity-table.component.html',
	styleUrl: './activity-table.component.css',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ActivityTableComponent extends RepositoryTableComponent<Activity, ActivitiesRepository> {
	constructor(
		private _repository: ActivitiesRepository,
		@Attribute('click-behavior') clickBehavior: BehaviorType
	) {
		super(
			_repository,
			{
				orderingBy: { fieldName: 'timeCreated', direction: 'desc' },
				alwaysOnFilters: [],
			},
			clickBehavior
		);
	}

	private _i18n_deleteSentence = this._translationService.prep('Are you sure you want to delete this activity?');
	private _accessService = inject(AccessService);
	public deleteActivity(activity: Activity) {
		this._notificationService.confirm(this._i18n_deleteSentence()).closed.subscribe((confirmed) => {
			if (!confirmed) return;
			this._repository.store
				.deleteObject$(activity.id)
				.pipe(switchMap(() => this.paginator.refresh()))
				.subscribe();
		});
	}

	public shareWithTeam(activity: Activity) {
		this._accessService.shareWithTeam(activity.id, 'activity');
	}

	public openSharingDetails(activity: Activity) {
		this._accessService.openSharingDetails(activity.id, 'activity');
	} 
}
