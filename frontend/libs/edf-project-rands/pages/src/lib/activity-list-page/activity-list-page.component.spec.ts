import { of, throwError } from 'rxjs';
import { ActivityListPageComponent } from './activity-list-page.component';

vi.mock('uuid', () => ({ v4: () => 'activity-uuid' }));

describe('ActivityListPageComponent', () => {
	function createComponent() {
		const component = Object.create(ActivityListPageComponent.prototype) as any;
		component.activitiesRepository = {
			store: {
				postObject$: vi.fn().mockReturnValue(of({ result: { data: { id: 'activity-created' } } })),
			},
			goToActivity: vi.fn(),
		};
		component._activitiesModals = {
			openActivityCreateDialog: vi.fn().mockReturnValue({
				closed: of({
					title: 'Activity',
					prefix: '1.1',
					batchId: 'batch-1',
					description: 'Desc',
					finality: 'Finality',
					strategicInterests: 'Interest',
					synergies: 'Synergy',
					risks: 'Risk',
					parades: 'Parade',
					priority: 'P1',
					isCorporate: true,
					isConfirmed: false,
					tags: ['alpha'],
				}),
			}),
		};
		return component;
	}

	it('creates a new activity and navigates to it', () => {
		const component = createComponent();

		component.createNew();

		expect(component._activitiesModals.openActivityCreateDialog).toHaveBeenCalled();
		expect(component.activitiesRepository.store.postObject$).toHaveBeenCalledWith(
			expect.objectContaining({
				id: 'activity-uuid',
				title: 'Activity',
				hidden: false,
				tags: ['alpha'],
			})
		);
		expect(component.activitiesRepository.goToActivity).toHaveBeenCalledWith('activity-created');
	});

	it('ignores a cancelled activity creation', () => {
		const component = createComponent();
		component._activitiesModals.openActivityCreateDialog.mockReturnValueOnce({ closed: of(undefined) });
		component.activitiesRepository.store.postObject$.mockReturnValueOnce(throwError(() => new Error('should not run')));

		component.createNew();

		expect(component.activitiesRepository.store.postObject$).not.toHaveBeenCalled();
		expect(component.activitiesRepository.goToActivity).not.toHaveBeenCalled();
	});
});
