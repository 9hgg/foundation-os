import { of } from 'rxjs';
import { ActivityTableComponent } from './activity-table.component';

describe('activity-table.component', () => {
	const activity = {
		id: 'activity-1',
		batchId: 'batch-1',
		priority: 1,
		isCorporate: false,
		isConfirmed: true,
		tags: [],
	};

	const buildComponent = () => {
		const refresh = vi.fn(() => of(null));
		const deleteObject$ = vi.fn(() => of({ result: {} }));
		const confirm = vi.fn(() => ({ closed: of(true) }));
		const shareWithTeam = vi.fn();
		const openSharingDetails = vi.fn();
		const component = Object.create(ActivityTableComponent.prototype) as ActivityTableComponent;

		component['_repository'] = { store: { deleteObject$ } } as never;
		component['_notificationService'] = { confirm } as never;
		component['_i18n_deleteSentence'] = () => 'Are you sure you want to delete this activity?';
		component['_accessService'] = { shareWithTeam, openSharingDetails } as never;
		component.paginator = { refresh } as never;

		return { component, confirm, deleteObject$, refresh, shareWithTeam, openSharingDetails };
	};

	it('deletes an activity only after confirmation and refreshes the paginator', () => {
		const { component, confirm, deleteObject$, refresh } = buildComponent();

		component.deleteActivity(activity);

		expect(confirm).toHaveBeenCalledWith('Are you sure you want to delete this activity?');
		expect(deleteObject$).toHaveBeenCalledWith('activity-1');
		expect(refresh).toHaveBeenCalled();
	});

	it('skips deletion when confirmation is rejected', () => {
		const { component, deleteObject$, confirm } = buildComponent();
		confirm.mockReturnValue({ closed: of(false) });

		component.deleteActivity(activity);

		expect(deleteObject$).not.toHaveBeenCalled();
	});

	it('shares an activity with the team', () => {
		const { component, shareWithTeam } = buildComponent();

		component.shareWithTeam(activity);

		expect(shareWithTeam).toHaveBeenCalledWith('activity-1', 'activity');
	});

	it('opens the sharing details for an activity', () => {
		const { component, openSharingDetails } = buildComponent();

		component.openSharingDetails(activity);

		expect(openSharingDetails).toHaveBeenCalledWith('activity-1', 'activity');
	});
});
