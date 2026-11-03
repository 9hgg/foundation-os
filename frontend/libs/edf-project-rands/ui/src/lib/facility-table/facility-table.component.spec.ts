import { FacilityTypeEnum } from '@edf/edf-project-rands/models';
import { of } from 'rxjs';
import { FacilityTableComponent } from './facility-table.component';

describe('facility-table.component', () => {
	const facility = {
		id: 'facility-1',
		name: 'Test bench',
		type: FacilityTypeEnum.TESTING,
	};

	const buildComponent = () => {
		const refresh = vi.fn(() => of(null));
		const deleteObject$ = vi.fn(() => of({ result: {} }));
		const confirm = vi.fn(() => ({ closed: of(true) }));
		const shareWithTeam = vi.fn();
		const openSharingDetails = vi.fn();
		const component = Object.create(FacilityTableComponent.prototype) as FacilityTableComponent;

		component['_repository'] = { store: { deleteObject$ } } as never;
		component['_notificationService'] = { confirm } as never;
		component['_i18n_deleteSentence'] = () => 'Are you sure you want to delete this facility?';
		component['_accessService'] = { shareWithTeam, openSharingDetails } as never;
		component.paginator = { refresh } as never;

		return { component, confirm, deleteObject$, refresh, shareWithTeam, openSharingDetails };
	};

	it('deletes a facility only after confirmation and refreshes the paginator', () => {
		const { component, confirm, deleteObject$, refresh } = buildComponent();

		component.deleteFacility(facility);

		expect(confirm).toHaveBeenCalledWith('Are you sure you want to delete this facility?');
		expect(deleteObject$).toHaveBeenCalledWith('facility-1');
		expect(refresh).toHaveBeenCalled();
	});

	it('skips deletion when confirmation is rejected', () => {
		const { component, deleteObject$, confirm } = buildComponent();
		confirm.mockReturnValue({ closed: of(false) });

		component.deleteFacility(facility);

		expect(deleteObject$).not.toHaveBeenCalled();
	});

	it('shares a facility with the team', () => {
		const { component, shareWithTeam } = buildComponent();

		component.shareWithTeam(facility);

		expect(shareWithTeam).toHaveBeenCalledWith('facility-1', 'facility');
	});

	it('opens the sharing details for a facility', () => {
		const { component, openSharingDetails } = buildComponent();

		component.openSharingDetails(facility);

		expect(openSharingDetails).toHaveBeenCalledWith('facility-1', 'facility');
	});
});
