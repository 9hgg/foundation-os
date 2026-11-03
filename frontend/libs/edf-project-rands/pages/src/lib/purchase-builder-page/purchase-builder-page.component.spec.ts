import { TestBed } from '@angular/core/testing';
import { ActivatedRoute } from '@angular/router';
import { NotificationService } from '@foundation/notification';
import { Purchase } from '@edf/edf-project-rands/models';
import { PurchasesRepository } from '@edf/edf-project-rands/state';
import { BehaviorSubject, of } from 'rxjs';
import { PurchaseBuilderPageComponent } from './purchase-builder-page.component';

describe('PurchaseBuilderPageComponent', () => {
	let getObjectByIdPullOnce$$$: ReturnType<typeof vi.fn>;
	let save: ReturnType<typeof vi.fn>;
	let paramMap$: BehaviorSubject<{ get: (key: string) => string | null }>;

	// The route id feeds the constructor's effect right away, so both the route value and the
	// repository mock must be configured before TestBed.createComponent()/detectChanges().
	const buildComponent = (purchaseId: string | null = null, purchase: Purchase | null = null) => {
		paramMap$ = new BehaviorSubject({ get: (key: string) => (key === 'purchaseId' ? purchaseId : null) });
		getObjectByIdPullOnce$$$ = vi.fn().mockReturnValue({ $: of(purchase) });
		save = vi.fn();

		TestBed.configureTestingModule({
			imports: [PurchaseBuilderPageComponent],
			providers: [
				{ provide: ActivatedRoute, useValue: { paramMap: paramMap$ } },
				{ provide: NotificationService, useValue: {} },
				{ provide: PurchasesRepository, useValue: { store: { getObjectByIdPullOnce$$$, save } } },
			],
		});
		TestBed.overrideComponent(PurchaseBuilderPageComponent, { set: { template: '' } });
		const fixture = TestBed.createComponent(PurchaseBuilderPageComponent);
		fixture.detectChanges();
		return { component: fixture.componentInstance, fixture };
	};

	afterEach(() => TestBed.resetTestingModule());

	it('starts with no purchase when the route carries no id', () => {
		const { component } = buildComponent();

		expect(component.purchase$$$.value).toBeNull();
		expect(getObjectByIdPullOnce$$$).not.toHaveBeenCalled();
	});

	it('loads the purchase named by the route', () => {
		const { component } = buildComponent('purchase-1', { id: 'purchase-1', title: 'Sensors', year: 2024, activityId: 'activity-1', estimatedCost: 1000 } as Purchase);

		expect(getObjectByIdPullOnce$$$).toHaveBeenCalledWith('purchase-1');
		expect(component.purchase$$$.value).toEqual({ id: 'purchase-1', title: 'Sensors', year: 2024, activityId: 'activity-1', estimatedCost: 1000 });
	});

	it('reloads the purchase when the route id changes', () => {
		const { component, fixture } = buildComponent('purchase-1', { id: 'purchase-1', title: 'Sensors', year: 2024, activityId: 'activity-1' } as Purchase);
		getObjectByIdPullOnce$$$.mockReturnValue({ $: of({ id: 'purchase-2', title: 'Cabling', year: 2025, activityId: 'activity-2' } as Purchase) });

		paramMap$.next({ get: (key) => (key === 'purchaseId' ? 'purchase-2' : null) });
		fixture.detectChanges();

		expect(component.purchaseId()).toBe('purchase-2');
		expect(getObjectByIdPullOnce$$$).toHaveBeenCalledWith('purchase-2');
		expect(component.purchase$$$.value).toEqual({ id: 'purchase-2', title: 'Cabling', year: 2025, activityId: 'activity-2' });
	});

	describe('updateTitle', () => {
		it('does nothing when no purchase is loaded', () => {
			const { component } = buildComponent();

			component.updateTitle('New title');

			expect(save).not.toHaveBeenCalled();
		});

		it('saves the purchase with the new title', () => {
			// purchase$$$.value is a deep clone on every read (BehaviorSubjectReplayed), so the
			// mutate-then-save pattern in updateTitle only affects the object passed to save(),
			// not the store's held value -- that only changes once save's result flows back in.
			const { component } = buildComponent('purchase-1', { id: 'purchase-1', title: 'Old title', year: 2024, activityId: 'activity-1' } as Purchase);

			component.updateTitle('New title');

			expect(save).toHaveBeenCalledWith(expect.objectContaining({ id: 'purchase-1', title: 'New title' }));
		});
	});

	describe('updateEstimatedCost', () => {
		it('does nothing when no purchase is loaded', () => {
			const { component } = buildComponent();

			component.updateEstimatedCost(500);

			expect(save).not.toHaveBeenCalled();
		});

		it('saves the purchase with the new estimated cost', () => {
			const { component } = buildComponent('purchase-1', { id: 'purchase-1', title: 'Sensors', year: 2024, activityId: 'activity-1', estimatedCost: 100 } as Purchase);

			component.updateEstimatedCost(2500);

			expect(save).toHaveBeenCalledWith(expect.objectContaining({ id: 'purchase-1', estimatedCost: 2500 }));
		});

		it('accepts a zeroed-out cost, as sent by the template when the input is cleared', () => {
			const { component } = buildComponent('purchase-1', { id: 'purchase-1', title: 'Sensors', year: 2024, activityId: 'activity-1', estimatedCost: 100 } as Purchase);

			component.updateEstimatedCost(0);

			expect(save).toHaveBeenCalledWith(expect.objectContaining({ estimatedCost: 0 }));
		});
	});
});
