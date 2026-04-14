/* eslint-disable @angular-eslint/prefer-inject */
import { CdkMenu, CdkMenuItem, CdkMenuModule } from '@angular/cdk/menu';
import { CommonModule } from '@angular/common';
import { Attribute, ChangeDetectionStrategy, Component, effect, EventEmitter, inject, input, Output, signal } from '@angular/core';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { Activity, Batch } from '@edf/edf-project-rands/models';
import { ActivitiesRepository, BatchesRepository } from '@edf/edf-project-rands/state';
import { AccessService } from '@foundation/shared/access';
import { BehaviorType, RepositoryTableComponent } from '@foundation/table/ui';
import { TranslateDirective, TranslatePipe } from '@foundation/translations/services';
import { switchMap, tap } from 'rxjs';
import { ActivityTableComponent } from '../activity-table/activity-table.component';

@Component({
	selector: 'lib-batch-table',
	standalone: true,
	imports: [CommonModule, TranslateDirective, TranslatePipe, ReactiveFormsModule, FormsModule, CdkMenuModule, CdkMenu, CdkMenuItem, ActivityTableComponent],
	templateUrl: './batch-table.component.html',
	styleUrl: './batch-table.component.css',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BatchTableComponent extends RepositoryTableComponent<Batch, BatchesRepository> {
	private _activitiesRepository = inject(ActivitiesRepository);
	private _accessService = inject(AccessService);

	activitiesByBatch = signal<Record<string, Activity[]>>({});
	activityLoadingState = signal<Record<string, boolean>>({});
	activityRefreshBatchId = input<string | null>(null);
	activityRefreshToken = input<number>(0);
	@Output() createActivityRequested = new EventEmitter<Batch>();
	constructor(
		private _repository: BatchesRepository,
		@Attribute('click-behavior') clickBehavior: BehaviorType
	) {
		super(
			_repository,
			{
				orderingBy: { fieldName: 'prefix', direction: 'asc' },
				alwaysOnFilters: [],
			},
			clickBehavior,
			'batch'
		);

		effect(() => {
			const batchId = this.activityRefreshBatchId();
			this.activityRefreshToken();
			if (batchId) {
				this.loadActivitiesForBatch(batchId);
			}
		});
	}

	private _i18n_deleteSentence = this._translationService.prep('Are you sure you want to delete this batch?');
	public deleteBatch(batch: Batch) {
		this._notificationService.confirm(this._i18n_deleteSentence()).closed.subscribe((confirmed) => {
			if (!confirmed) return;
			this._repository.store
				.deleteObject$(batch.id)
				.pipe(switchMap(() => this.paginator.refresh()))
				.subscribe();
		});
	}

	public shareWithTeam(batch: Batch) {
		this._accessService.shareWithTeam(batch.id, 'batch');
	}

	public openSharingDetails(batch: Batch) {
		this._accessService.openSharingDetails(batch.id, 'batch');
	}

	public openBatch(batch: Batch) {
		this._repository.goToBatch(batch.id);
	}

	public openActivity(activity: Activity) {
		this._activitiesRepository.goToActivity(activity.id);
	}

	public requestCreateActivity(batch: Batch) {
		this.createActivityRequested.emit(batch);
	}

	public getActivitiesForBatch(batchId: string): Activity[] {
		const activities = this.activitiesByBatch()[batchId];
		const isLoading = this.activityLoadingState()[batchId];
		if (!activities && !isLoading) {
			this.loadActivitiesForBatch(batchId);
		}
		return activities ?? [];
	}

	private loadActivitiesForBatch(batchId: string) {
		this.activityLoadingState.set({
			...this.activityLoadingState(),
			[batchId]: true,
		});
		this._requestService
			.getBasic$<{ data: Activity[] }>('/api/edf/rand/activities', {
				filters: `batch_id:${batchId}:exact`,
				page_size: 200,
			})
			.pipe(
				tap((response) => {
					this.activitiesByBatch.set({
						...this.activitiesByBatch(),
						[batchId]: response?.result?.data ?? [],
					});
					this.activityLoadingState.set({
						...this.activityLoadingState(),
						[batchId]: false,
					});
				})
			)
			.subscribe();
	}
}
