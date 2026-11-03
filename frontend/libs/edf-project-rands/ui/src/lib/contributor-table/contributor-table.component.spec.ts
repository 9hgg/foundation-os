import { of } from 'rxjs';
import { ContributorTableComponent } from './contributor-table.component';

describe('contributor-table.component', () => {
	const contributor = {
		id: 'contributor-1',
		firstName: 'Grace',
		lastName: 'Hopper',
	};

	const buildComponent = () => {
		const refresh = vi.fn(() => of(null));
		const deleteObject$ = vi.fn(() => of({ result: {} }));
		const confirm = vi.fn(() => ({ closed: of(true) }));
		const shareWithTeam = vi.fn();
		const openSharingDetails = vi.fn();
		const component = Object.create(ContributorTableComponent.prototype) as ContributorTableComponent;

		component['_repository'] = { store: { deleteObject$ } } as never;
		component['_notificationService'] = { confirm } as never;
		component['_i18n_deleteSentence'] = () => 'Are you sure you want to delete this contributor?';
		component['_accessService'] = { shareWithTeam, openSharingDetails } as never;
		component.paginator = { refresh } as never;

		return { component, confirm, deleteObject$, refresh, shareWithTeam, openSharingDetails };
	};

	it('deletes a contributor only after confirmation and refreshes the paginator', () => {
		const { component, confirm, deleteObject$, refresh } = buildComponent();

		component.deleteContributor(contributor);

		expect(confirm).toHaveBeenCalledWith('Are you sure you want to delete this contributor?');
		expect(deleteObject$).toHaveBeenCalledWith('contributor-1');
		expect(refresh).toHaveBeenCalled();
	});

	it('skips deletion when confirmation is rejected', () => {
		const { component, deleteObject$, confirm } = buildComponent();
		confirm.mockReturnValue({ closed: of(false) });

		component.deleteContributor(contributor);

		expect(deleteObject$).not.toHaveBeenCalled();
	});

	it('shares a contributor with the team', () => {
		const { component, shareWithTeam } = buildComponent();

		component.shareWithTeam(contributor);

		expect(shareWithTeam).toHaveBeenCalledWith('contributor-1', 'contributor');
	});

	it('opens the sharing details for a contributor', () => {
		const { component, openSharingDetails } = buildComponent();

		component.openSharingDetails(contributor);

		expect(openSharingDetails).toHaveBeenCalledWith('contributor-1', 'contributor');
	});
});
