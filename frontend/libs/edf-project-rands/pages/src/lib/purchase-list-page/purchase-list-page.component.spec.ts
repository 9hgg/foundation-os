import { of } from 'rxjs';
import { PurchaseListPageComponent } from './purchase-list-page.component';

vi.mock('uuid', () => ({ v4: () => 'purchase-uuid' }));

describe('PurchaseListPageComponent', () => {
	function createComponent() {
		const component = Object.create(PurchaseListPageComponent.prototype) as any;
		component.purchasesRepository = {
			store: {
				postObject$: vi.fn().mockReturnValue(of({ result: { data: { id: 'purchase-created' } } })),
			},
			goToPurchase: vi.fn(),
		};
		component._purchasesModals = {
			openPurchaseCreateDialog: vi.fn().mockReturnValue({
				closed: of({
					year: 2026,
					title: 'Purchase',
					activityId: 'activity-1',
					details: 'Details',
					estimatedCost: 1500,
					supplier: 'ACME',
				}),
			}),
		};
		return component;
	}

	it('creates a purchase and navigates to it', () => {
		const component = createComponent();

		component.createNew();

		expect(component.purchasesRepository.store.postObject$).toHaveBeenCalledWith(
			expect.objectContaining({
				id: 'purchase-uuid',
				year: 2026,
				title: 'Purchase',
				supplier: 'ACME',
			})
		);
		expect(component.purchasesRepository.goToPurchase).toHaveBeenCalledWith('purchase-created');
	});

	it('ignores cancelled purchase creation', () => {
		const component = createComponent();
		component._purchasesModals.openPurchaseCreateDialog.mockReturnValueOnce({ closed: of(undefined) });

		component.createNew();

		expect(component.purchasesRepository.store.postObject$).not.toHaveBeenCalled();
		expect(component.purchasesRepository.goToPurchase).not.toHaveBeenCalled();
	});
});
