import { CustomerBuilderPageComponent } from './customer-builder-page.component';

describe('CustomerBuilderPageComponent', () => {
	function createComponent() {
		const component = Object.create(CustomerBuilderPageComponent.prototype) as any;
		component.customer$$$ = {
			value: {
				id: 'customer-1',
				firstName: 'EDF',
				lastName: 'Client',
				identifier: 'C-001',
				unit: 'R&D',
			},
		};
		component._customersRepository = {
			store: {
				save: vi.fn(),
			},
		};
		return component;
	}

	it('updates customer names, identifier, and unit', () => {
		const component = createComponent();

		component.updateNames('Alice', 'Martin');
		component.updateIdentifier('C-002');
		component.updateUnit('Innovation');

		expect(component.customer$$$.value).toEqual({
			id: 'customer-1',
			firstName: 'Alice',
			lastName: 'Martin',
			identifier: 'C-002',
			unit: 'Innovation',
		});
		expect(component._customersRepository.store.save).toHaveBeenCalledTimes(3);
	});

	it('ignores updates when no customer is loaded', () => {
		const component = createComponent();
		component.customer$$$.value = null;

		component.updateNames('Alice', 'Martin');
		component.updateIdentifier('C-002');
		component.updateUnit('Innovation');

		expect(component._customersRepository.store.save).not.toHaveBeenCalled();
	});
});
