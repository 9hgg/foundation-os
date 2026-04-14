/* eslint-disable @angular-eslint/prefer-inject */
import { CdkMenu, CdkMenuItem, CdkMenuModule } from '@angular/cdk/menu';
import { CommonModule } from '@angular/common';
import { Attribute, ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { Activity, Batch, Deliverable } from '@edf/edf-project-rands/models';
import { ActivitiesRepository, BatchesRepository, DeliverablesRepository } from '@edf/edf-project-rands/state';
import { AccessService } from '@foundation/shared/access';
import { BehaviorType, GenericItemTableComponent } from '@foundation/table/ui';
import { TranslateDirective, TranslatePipe } from '@foundation/translations/services';
import { switchMap } from 'rxjs';

export interface DetailedActivity {
	id: string;
	batch: Batch;
	activity: Activity;
	deliverables: Deliverable[];
	mergedPrefix: string;
	mergedPrefixSort: string;
	batchPrefix: string;
	activityPrefix: string;
	activityTitle: string;
	batchPrefixSort: string;
	activityPrefixSort: string;
}

export const EMPTY_ACTIVITY: Activity = {
	batchId: '',
	priority: 0,
	isCorporate: false,
	isConfirmed: false,
	hidden: false,
	tags: [],
	id: '',
};

@Component({
	selector: 'lib-detailed-project-table',
	standalone: true,
	imports: [CommonModule, TranslateDirective, TranslatePipe, ReactiveFormsModule, FormsModule, CdkMenuModule, CdkMenu, CdkMenuItem],
	templateUrl: './detailed-project-table.component.html',
	styleUrl: './detailed-project-table.component.css',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DetailedProjectTableComponent extends GenericItemTableComponent<DetailedActivity> {
	private _activitiesRepository = inject(ActivitiesRepository);
	private _batchesRepository = inject(BatchesRepository);
	private _deliverablesRepository = inject(DeliverablesRepository);
	private _accessService = inject(AccessService);

	// project
	public projectId = input<string | null>(null);
	// project$$$ = new BehaviorSubjectReplayed<Project | null>(null);
	public displayBatchColumn = input(true);
	public deliverableToCreate = output<Activity>();

	constructor(@Attribute('click-behavior') clickBehavior: BehaviorType) {
		super(
			{
				orderingBy: { fieldName: 'mergedPrefixSort', direction: 'asc' },
				alwaysOnFilters: [],
				pageSize: 100,
			},
			clickBehavior,
			'detailed-activity'
		);

		// effect(() => {
		// 	const projectId = this.projectId();
		// 	this.project$$$.setSource(projectId ? this._projectsRepository.store.getObjectById$$$(projectId, true).$ : of(null));
		// });
	}

	// batchs
	public openBatch(batch: Batch) {
		this._batchesRepository.goToBatch(batch.id);
	}
	private _i18n_deleteSentence = this._translationService.prep('Are you sure you want to delete this batch?');
	public deleteBatch(batch: Batch) {
		this._notificationService.confirm(this._i18n_deleteSentence()).closed.subscribe((confirmed) => {
			if (!confirmed) return;
			this._batchesRepository.store
				.deleteObject$(batch.id)
				.pipe(
					switchMap(() => {
						return this.paginator.refresh();
					})
				)
				.subscribe();
		});
	}
	public openBatchSharingDetails(batch: Batch) {
		this._accessService.openSharingDetails(batch.id, 'batch');
	}
	public shareBatchWithTeam(batch: Batch) {
		this._accessService.shareWithTeam(batch.id, 'batch');
	}
	// activities
	public openActivity(activity: Activity) {
		this._activitiesRepository.goToActivity(activity.id);
	}

	public openDeliverable(deliverable: Deliverable) {
		this._deliverablesRepository.goToDeliverable(deliverable.id);
	}

	public requestCreateDeliverable(activity: Activity) {
		this.deliverableToCreate.emit(activity);
	}

	private _i18n_deleteActivitySentence = this._translationService.prep('Are you sure you want to delete this activity?');
	public deleteActivity(activity: Activity) {
		this._notificationService.confirm(this._i18n_deleteActivitySentence()).closed.subscribe((confirmed) => {
			if (!confirmed) return;
			this._activitiesRepository.store
				.deleteObject$(activity.id)
				.pipe(
					switchMap(() => {
						return this.paginator.refresh();
					})
				)
				.subscribe();
		});
	}
}
