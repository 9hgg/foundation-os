import { of } from 'rxjs';
import { CustomerTableComponent } from './customer-table.component';

describe('customer-table.component', () => {
	const customer = {
		id: 'customer-1',
		firstName: 'Ada',
		lastName: 'Lovelace',
	};

	const buildComponent = () => {
		const refresh = vi.fn(() => of(null));
		const deleteObject$ = vi.fn(() => of({ result: {} }));
		const confirm = vi.fn(() => ({ closed: of(true) }));
		const shareWithTeam = vi.fn();
		const openSharingDetails = vi.fn();
		const component = Object.create(CustomerTableComponent.prototype) as CustomerTableComponent;

		component['_repository'] = { store: { deleteObject$ } } as never;
		component['_notificationService'] = { confirm } as never;
		component['_i18n_deleteSentence'] = () => 'Are you sure you want to delete this customer?';
		component['_accessService'] = { shareWithTeam, openSharingDetails } as never;
		component.paginator = { refresh } as never;

		return { component, confirm, deleteObject$, refresh, shareWithTeam, openSharingDetails };
	};

	it('deletes a customer only after confirmation and refreshes the paginator', () => {
		const { component, confirm, deleteObject$, refresh } = buildComponent();

		component.deleteCustomer(customer);

		expect(confirm).toHaveBeenCalledWith('Are you sure you want to delete this customer?');
		expect(deleteObject$).toHaveBeenCalledWith('customer-1');
		expect(refresh).toHaveBeenCalled();
	});

	it('skips deletion when confirmation is rejected', () => {
		const { component, deleteObject$, confirm } = buildComponent();
		confirm.mockReturnValue({ closed: of(false) });

		component.deleteCustomer(customer);

		expect(deleteObject$).not.toHaveBeenCalled();
	});

	it('shares a customer with the team', () => {
		const { component, shareWithTeam } = buildComponent();

		component.shareWithTeam(customer);

		expect(shareWithTeam).toHaveBeenCalledWith('customer-1', 'customer');
	});

	it('opens the sharing details for a customer', () => {
		const { component, openSharingDetails } = buildComponent();

		component.openSharingDetails(customer);

		expect(openSharingDetails).toHaveBeenCalledWith('customer-1', 'customer');
	});
});
