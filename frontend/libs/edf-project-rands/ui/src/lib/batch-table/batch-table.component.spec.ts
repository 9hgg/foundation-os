import { signal } from '@angular/core';
import { of } from 'rxjs';
import { Activity, Batch } from '@edf/edf-project-rands/models';
import { BatchTableComponent } from './batch-table.component';

describe('batch-table.component', () => {
	const batch: Batch = { id: 'batch-1', kind: 'batch' as never, title: 'Batch 1', projectId: 'project-1' } as never;
	const activity: Activity = {
		id: 'activity-1',
		batchId: 'batch-1',
		priority: 0,
		isCorporate: false,
		isConfirmed: false,
		tags: [],
	};

	const buildComponent = () => {
		const refresh = vi.fn(() => of(null));
		const deleteObject$ = vi.fn(() => of({ result: {} }));
		const goToBatch = vi.fn();
		const goToActivity = vi.fn();
		const confirm = vi.fn(() => ({ closed: of(true) }));
		const shareWithTeam = vi.fn();
		const openSharingDetails = vi.fn();
		const getBasic$ = vi.fn(() => of({ result: { data: [activity] } }));
		const emit = vi.fn();
		const component = Object.create(BatchTableComponent.prototype) as BatchTableComponent;

		component['_repository'] = { store: { deleteObject$ }, goToBatch } as never;
		component['_activitiesRepository'] = { goToActivity } as never;
		component['_accessService'] = { shareWithTeam, openSharingDetails } as never;
		component['_requestService'] = { getBasic$ } as never;
		component['_notificationService'] = { confirm } as never;
		component['_i18n_deleteSentence'] = () => 'Are you sure you want to delete this batch?';
		component.paginator = { refresh } as never;
		component.activitiesByBatch = signal({});
		component.activityLoadingState = signal({});
		component.createActivityRequested = { emit } as never;

		return { component, confirm, deleteObject$, goToBatch, goToActivity, refresh, shareWithTeam, openSharingDetails, getBasic$, emit };
	};

	it('deletes a batch only after confirmation and refreshes the paginator', () => {
		const { component, confirm, deleteObject$, refresh } = buildComponent();

		component.deleteBatch(batch);

		expect(confirm).toHaveBeenCalledWith('Are you sure you want to delete this batch?');
		expect(deleteObject$).toHaveBeenCalledWith('batch-1');
		expect(refresh).toHaveBeenCalled();
	});

	it('skips deletion when confirmation is rejected', () => {
		const { component, confirm, deleteObject$ } = buildComponent();
		confirm.mockReturnValue({ closed: of(false) });

		component.deleteBatch(batch);

		expect(deleteObject$).not.toHaveBeenCalled();
	});

	it('delegates team sharing and sharing details to the access service', () => {
		const { component, shareWithTeam, openSharingDetails } = buildComponent();

		component.shareWithTeam(batch);
		component.openSharingDetails(batch);

		expect(shareWithTeam).toHaveBeenCalledWith('batch-1', 'batch');
		expect(openSharingDetails).toHaveBeenCalledWith('batch-1', 'batch');
	});

	it('delegates batch and activity navigation to their repositories', () => {
		const { component, goToBatch, goToActivity } = buildComponent();

		component.openBatch(batch);
		component.openActivity(activity);

		expect(goToBatch).toHaveBeenCalledWith('batch-1');
		expect(goToActivity).toHaveBeenCalledWith('activity-1');
	});

	it('emits a create-activity request for the batch', () => {
		const { component, emit } = buildComponent();

		component.requestCreateActivity(batch);

		expect(emit).toHaveBeenCalledWith(batch);
	});

	describe('loadActivitiesForBatch', () => {
		it('fetches activities scoped to the batch and caches them', () => {
			const { component, getBasic$ } = buildComponent();

			component['loadActivitiesForBatch']('batch-1');

			expect(getBasic$).toHaveBeenCalledWith('/api/edf/rand/activities', { filters: 'batch_id:batch-1:exact', page_size: 200 });
			expect(component.activitiesByBatch()['batch-1']).toEqual([activity]);
			expect(component.activityLoadingState()['batch-1']).toBe(false);
		});
	});

	describe('getActivitiesForBatch', () => {
		it('triggers a load and returns an empty array on the first call', () => {
			const { component, getBasic$ } = buildComponent();

			const result = component.getActivitiesForBatch('batch-1');

			expect(result).toEqual([]);
			expect(getBasic$).toHaveBeenCalled();
		});

		it('returns the cached activities without reloading once they are known', () => {
			const { component, getBasic$ } = buildComponent();
			component.activitiesByBatch.set({ 'batch-1': [activity] });

			const result = component.getActivitiesForBatch('batch-1');

			expect(result).toEqual([activity]);
			expect(getBasic$).not.toHaveBeenCalled();
		});

		it('does not trigger another load while one is already in flight', () => {
			const { component, getBasic$ } = buildComponent();
			component.activityLoadingState.set({ 'batch-1': true });

			const result = component.getActivitiesForBatch('batch-1');

			expect(result).toEqual([]);
			expect(getBasic$).not.toHaveBeenCalled();
		});
	});
});
