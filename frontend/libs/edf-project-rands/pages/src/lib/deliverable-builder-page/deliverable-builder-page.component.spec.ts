import { of } from 'rxjs';
import { DeliverableBuilderPageComponent } from './deliverable-builder-page.component';

function createSignal<T>(initialValue: T) {
	let value = initialValue;
	const signal: any = () => value;
	signal.set = (nextValue: T) => {
		value = nextValue;
	};
	return signal as (() => T) & { set: (value: T) => void };
}

describe('DeliverableBuilderPageComponent', () => {
	function createComponent() {
		const component = Object.create(DeliverableBuilderPageComponent.prototype) as any;
		component.deliverable$$$ = {
			value: {
				id: 'deliverable-1',
				title: 'Deliverable',
				description: 'Desc',
				customerId: 'customer-1',
				isPrincipal: false,
				hidden: false,
			},
		};
		component.selectedCustomer = createSignal({ id: 'customer-1', firstName: 'EDF' });
		component.project = createSignal({ id: 'project-1' });
		component._deliverablesRepository = {
			store: {
				save: vi.fn(),
			},
		};
		component._customersModals = {
			openCustomerSelectDialog: vi.fn().mockReturnValue({ closed: of({ customers: [{ id: 'customer-2', firstName: 'Sponsor' }] }) }),
		};
		return component;
	}

	it('updates deliverable fields and customer selection', () => {
		const component = createComponent();

		component.updateTitle('Updated deliverable');
		component.updateDates('2026-01-01', '2026-12-31');
		component.updateDescription('Updated description');
		component.updateIsPrincipal(true);
		component.updateHidden(true);
		component.selectCustomer();
		component.clearCustomer();

		expect(component.deliverable$$$.value).toEqual(
			expect.objectContaining({
				title: 'Updated deliverable',
				startDate: '2026-01-01',
				endDate: '2026-12-31',
				description: 'Updated description',
				isPrincipal: true,
				hidden: true,
				customerId: undefined,
			})
		);
		expect(component.selectedCustomer()).toBe(null);
		expect(component._customersModals.openCustomerSelectDialog).toHaveBeenCalled();
		expect(component._deliverablesRepository.store.save).toHaveBeenCalled();
	});
});
