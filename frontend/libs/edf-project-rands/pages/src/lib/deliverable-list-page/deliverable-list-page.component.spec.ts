import { of } from 'rxjs';
import { DeliverableListPageComponent } from './deliverable-list-page.component';

vi.mock('uuid', () => ({ v4: () => 'deliverable-uuid' }));

describe('DeliverableListPageComponent', () => {
	function createComponent() {
		const component = Object.create(DeliverableListPageComponent.prototype) as any;
		component.deliverablesRepository = {
			store: {
				postObject$: vi.fn().mockReturnValue(of({ result: { data: { id: 'deliverable-created' } } })),
			},
			goToDeliverable: vi.fn(),
		};
		component._deliverablesModals = {
			openDeliverableCreateDialog: vi.fn().mockReturnValue({
				closed: of({
					title: 'Deliverable',
					description: 'Desc',
					customerId: 'customer-1',
					startDate: '2026-01-01',
					endDate: '2026-12-31',
					isPrincipal: true,
				}),
			}),
		};
		return component;
	}

	it('creates a deliverable and navigates to it', () => {
		const component = createComponent();

		component.createNew();

		expect(component.deliverablesRepository.store.postObject$).toHaveBeenCalledWith(
			expect.objectContaining({
				id: 'deliverable-uuid',
				title: 'Deliverable',
				isPrincipal: true,
				hidden: false,
			})
		);
		expect(component.deliverablesRepository.goToDeliverable).toHaveBeenCalledWith('deliverable-created');
	});

	it('ignores cancelled deliverable creation', () => {
		const component = createComponent();
		component._deliverablesModals.openDeliverableCreateDialog.mockReturnValueOnce({ closed: of(undefined) });

		component.createNew();

		expect(component.deliverablesRepository.store.postObject$).not.toHaveBeenCalled();
		expect(component.deliverablesRepository.goToDeliverable).not.toHaveBeenCalled();
	});
});
