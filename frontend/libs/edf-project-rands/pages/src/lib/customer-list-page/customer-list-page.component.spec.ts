import { of } from 'rxjs';
import { CustomerListPageComponent } from './customer-list-page.component';

vi.mock('uuid', () => ({ v4: () => 'customer-uuid' }));

describe('CustomerListPageComponent', () => {
	function createComponent() {
		const component = Object.create(CustomerListPageComponent.prototype) as any;
		component.customersRepository = {
			store: {
				postObject$: vi.fn().mockReturnValue(of({ result: { data: { id: 'customer-created' } } })),
			},
			goToCustomer: vi.fn(),
		};
		component._customersModals = {
			openCustomerCreateDialog: vi.fn().mockReturnValue({
				closed: of({
					identifier: 'C-001',
					unit: 'R&D',
					referentId: 'contributor-1',
					technicalReferentId: 'contributor-2',
					firstName: 'EDF',
					lastName: 'Client',
				}),
			}),
		};
		return component;
	}

	it('creates a customer and navigates to it', () => {
		const component = createComponent();

		component.createNew();

		expect(component.customersRepository.store.postObject$).toHaveBeenCalledWith(
			expect.objectContaining({
				id: 'customer-uuid',
				identifier: 'C-001',
				lastName: 'Client',
			})
		);
		expect(component.customersRepository.goToCustomer).toHaveBeenCalledWith('customer-created');
	});

	it('ignores cancelled customer creation', () => {
		const component = createComponent();
		component._customersModals.openCustomerCreateDialog.mockReturnValueOnce({ closed: of(undefined) });

		component.createNew();

		expect(component.customersRepository.store.postObject$).not.toHaveBeenCalled();
		expect(component.customersRepository.goToCustomer).not.toHaveBeenCalled();
	});
});
