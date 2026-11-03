import { of } from 'rxjs';
import { Activity, Batch, Deliverable } from '@edf/edf-project-rands/models';
import { DetailedProjectTableComponent, EMPTY_ACTIVITY } from './detailed-project-table.component';

describe('detailed-project-table.component', () => {
	describe('EMPTY_ACTIVITY', () => {
		it('is a blank, unconfirmed, non-corporate activity with no tags', () => {
			expect(EMPTY_ACTIVITY).toEqual({
				batchId: '',
				priority: 0,
				isCorporate: false,
				isConfirmed: false,
				hidden: false,
				tags: [],
				id: '',
			});
		});
	});

	describe('DetailedProjectTableComponent', () => {
		const batch: Batch = { id: 'batch-1', kind: 'batch' as never, title: 'Batch 1', projectId: 'project-1' } as never;
		const activity: Activity = {
			id: 'activity-1',
			batchId: 'batch-1',
			priority: 0,
			isCorporate: false,
			isConfirmed: false,
			tags: [],
		};
		const deliverable: Deliverable = { id: 'deliverable-1', kind: 'deliverable' as never, title: 'Deliverable 1', isPrincipal: false } as never;

		const buildComponent = () => {
			const refresh = vi.fn(() => of(null));
			const deleteBatchObject$ = vi.fn(() => of({ result: {} }));
			const deleteActivityObject$ = vi.fn(() => of({ result: {} }));
			const goToBatch = vi.fn();
			const goToActivity = vi.fn();
			const goToDeliverable = vi.fn();
			const confirm = vi.fn(() => ({ closed: of(true) }));
			const shareWithTeam = vi.fn();
			const openSharingDetails = vi.fn();
			const emit = vi.fn();
			const component = Object.create(DetailedProjectTableComponent.prototype) as DetailedProjectTableComponent;

			component['_batchesRepository'] = { store: { deleteObject$: deleteBatchObject$ }, goToBatch } as never;
			component['_activitiesRepository'] = { store: { deleteObject$: deleteActivityObject$ }, goToActivity } as never;
			component['_deliverablesRepository'] = { goToDeliverable } as never;
			component['_accessService'] = { shareWithTeam, openSharingDetails } as never;
			component['_notificationService'] = { confirm } as never;
			component['_i18n_deleteSentence'] = () => 'Are you sure you want to delete this batch?';
			component['_i18n_deleteActivitySentence'] = () => 'Are you sure you want to delete this activity?';
			component.paginator = { refresh } as never;
			component.deliverableToCreate = { emit } as never;

			return { component, confirm, deleteBatchObject$, deleteActivityObject$, goToBatch, goToActivity, goToDeliverable, refresh, shareWithTeam, openSharingDetails, emit };
		};

		it('delegates batch navigation to the batches repository', () => {
			const { component, goToBatch } = buildComponent();

			component.openBatch(batch);

			expect(goToBatch).toHaveBeenCalledWith('batch-1');
		});

		it('deletes a batch only after confirmation and refreshes the paginator', () => {
			const { component, confirm, deleteBatchObject$, refresh } = buildComponent();

			component.deleteBatch(batch);

			expect(confirm).toHaveBeenCalledWith('Are you sure you want to delete this batch?');
			expect(deleteBatchObject$).toHaveBeenCalledWith('batch-1');
			expect(refresh).toHaveBeenCalled();
		});

		it('skips batch deletion when confirmation is rejected', () => {
			const { component, confirm, deleteBatchObject$ } = buildComponent();
			confirm.mockReturnValue({ closed: of(false) });

			component.deleteBatch(batch);

			expect(deleteBatchObject$).not.toHaveBeenCalled();
		});

		it('delegates batch sharing and sharing details to the access service', () => {
			const { component, shareWithTeam, openSharingDetails } = buildComponent();

			component.shareBatchWithTeam(batch);
			component.openBatchSharingDetails(batch);

			expect(shareWithTeam).toHaveBeenCalledWith('batch-1', 'batch');
			expect(openSharingDetails).toHaveBeenCalledWith('batch-1', 'batch');
		});

		it('delegates activity navigation to the activities repository', () => {
			const { component, goToActivity } = buildComponent();

			component.openActivity(activity);

			expect(goToActivity).toHaveBeenCalledWith('activity-1');
		});

		it('delegates deliverable navigation to the deliverables repository', () => {
			const { component, goToDeliverable } = buildComponent();

			component.openDeliverable(deliverable);

			expect(goToDeliverable).toHaveBeenCalledWith('deliverable-1');
		});

		it('emits a create-deliverable request for the activity', () => {
			const { component, emit } = buildComponent();

			component.requestCreateDeliverable(activity);

			expect(emit).toHaveBeenCalledWith(activity);
		});

		it('deletes an activity only after confirmation and refreshes the paginator', () => {
			const { component, confirm, deleteActivityObject$, refresh } = buildComponent();

			component.deleteActivity(activity);

			expect(confirm).toHaveBeenCalledWith('Are you sure you want to delete this activity?');
			expect(deleteActivityObject$).toHaveBeenCalledWith('activity-1');
			expect(refresh).toHaveBeenCalled();
		});

		it('skips activity deletion when confirmation is rejected', () => {
			const { component, confirm, deleteActivityObject$ } = buildComponent();
			confirm.mockReturnValue({ closed: of(false) });

			component.deleteActivity(activity);

			expect(deleteActivityObject$).not.toHaveBeenCalled();
		});
	});
});
