import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { RequestService } from '@foundation/network/services';
import { NotificationService } from '@foundation/notification';
import { TranslationService } from '@foundation/translations/services';
import { DragAndDropService } from '@foundation/utils';
import { AccessService } from '@foundation/shared/access';
import { Purchase } from '@edf/edf-project-rands/models';
import { PurchasesRepository } from '@edf/edf-project-rands/state';
import { EMPTY, of } from 'rxjs';
import { PurchaseTableComponent } from './purchase-table.component';

vi.mock('uuid', () => ({ v4: () => 'purchase-uuid' }));

describe('PurchaseTableComponent', () => {
	const purchase = (overrides: Partial<Purchase> = {}): Purchase => ({
		id: 'purchase-1',
		activityId: 'activity-1',
		title: 'Purchase 1',
		year: 2026,
		details: '',
		estimatedCost: 100,
		supplier: '',
		...overrides,
	});

	const buildComponent = () => {
		const save = vi.fn(() => of({}));
		const postObject$ = vi.fn((payload: Purchase) => of({ result: { data: payload } }));
		const deleteObject$ = vi.fn(() => of({ result: {} }));
		const refresh = vi.fn(() => of(null));
		const confirm = vi.fn(() => ({ closed: of(true) }));
		const shareWithTeam = vi.fn();
		const openSharingDetails = vi.fn();

		TestBed.configureTestingModule({
			providers: [
				{
					provide: PurchasesRepository,
					useValue: { store: { getObjects$: () => of({ data: [], totalCount: 0, page: 1 }), getObjectById$$$: () => ({ $: of(null) }), save, postObject$, deleteObject$ } },
				},
				{ provide: Router, useValue: { navigate: vi.fn(), events: EMPTY } },
				{ provide: ActivatedRoute, useValue: { queryParams: of({}) } },
				{ provide: RequestService, useValue: {} },
				{ provide: NotificationService, useValue: { confirm } },
				{ provide: TranslationService, useValue: { prep: (value: string) => () => value } },
				{ provide: DragAndDropService, useValue: {} },
				{ provide: AccessService, useValue: { shareWithTeam, openSharingDetails } },
			],
		});
		TestBed.overrideComponent(PurchaseTableComponent, { set: { template: '' } });

		const fixture = TestBed.createComponent(PurchaseTableComponent);
		fixture.detectChanges();
		const component = fixture.componentInstance;
		component.paginator.refresh = refresh;

		return { fixture, component, save, postObject$, deleteObject$, refresh, confirm, shareWithTeam, openSharingDetails };
	};

	afterEach(() => TestBed.resetTestingModule());

	describe('deletePurchase', () => {
		it('deletes only after confirmation and refreshes', () => {
			const { component, confirm, deleteObject$, refresh } = buildComponent();

			component.deletePurchase(purchase());

			expect(confirm).toHaveBeenCalled();
			expect(deleteObject$).toHaveBeenCalledWith('purchase-1');
			expect(refresh).toHaveBeenCalled();
		});

		it('skips deletion when not confirmed', () => {
			const { component, confirm, deleteObject$ } = buildComponent();
			confirm.mockReturnValueOnce({ closed: of(false) });

			component.deletePurchase(purchase());

			expect(deleteObject$).not.toHaveBeenCalled();
		});
	});

	it('delegates team sharing and sharing details to the access service', () => {
		const { component, shareWithTeam, openSharingDetails } = buildComponent();

		component.shareWithTeam(purchase());
		component.openSharingDetails(purchase());

		expect(shareWithTeam).toHaveBeenCalledWith('purchase-1', 'purchase');
		expect(openSharingDetails).toHaveBeenCalledWith('purchase-1', 'purchase');
	});

	describe('getBaseCost', () => {
		it('prefers estimatedCost, then max, then min', () => {
			const { component } = buildComponent();
			expect(component.getBaseCost(purchase({ estimatedCost: 100, maxEstimatedCost: 200 }))).toBe(100);
			expect(component.getBaseCost(purchase({ estimatedCost: undefined, maxEstimatedCost: 200, minEstimatedCost: 50 }))).toBe(200);
			expect(component.getBaseCost(purchase({ estimatedCost: undefined, maxEstimatedCost: undefined, minEstimatedCost: 50 }))).toBe(50);
			expect(component.getBaseCost(purchase({ estimatedCost: undefined, maxEstimatedCost: undefined, minEstimatedCost: undefined }))).toBeNull();
		});
	});

	describe('getOverheadCoefficient / getBilledAmountKeur / formulaHtml', () => {
		it('returns the known coefficient and computed formula for a covered year', () => {
			const { component } = buildComponent();
			const item = purchase({ year: 2026, estimatedCost: 100 });

			expect(component.getOverheadCoefficient(item)).toBe(1.38);
			expect(component.getBilledAmountKeur(item)).toBe(0.14);
			expect(component.formulaHtml(item)).toBe('100€ × 1.38 = <strong>0.14k€</strong>');
		});

		it('falls back to null/dash for an uncovered year', () => {
			const { component } = buildComponent();
			const item = purchase({ year: 1999, estimatedCost: 100 });

			expect(component.getOverheadCoefficient(item)).toBeNull();
			expect(component.getBilledAmountKeur(item)).toBeNull();
			expect(component.formulaHtml(item)).toBe('—');
		});
	});

	describe('editableYears', () => {
		it('merges present years with the default surrounding range, deduped and sorted descending', () => {
			const { component, fixture } = buildComponent();
			fixture.componentRef.setInput('explicitItems', [purchase({ id: 'a', year: 2015 }), purchase({ id: 'b', year: 2040 })]);

			const years = component.editableYears();
			const currentYear = new Date().getFullYear();
			expect(years[0]).toBe(2040);
			expect(years[years.length - 1]).toBe(2015);
			expect(years).toContain(currentYear);
			expect(new Set(years).size).toBe(years.length);
		});
	});

	describe('inline editing state', () => {
		it('starts editing by seeding title, year and cost', () => {
			const { component } = buildComponent();
			const item = purchase({ title: 'Laptop', year: 2027, estimatedCost: 250 });

			component.startEdit(item);

			expect(component.isEditing(item)).toBe(true);
			expect(component.editTitle()).toBe('Laptop');
			expect(component.editYear()).toBe(2027);
			expect(component.editEstimatedCost()).toBe(250);
		});

		it('is not editing an unrelated purchase', () => {
			const { component } = buildComponent();
			component.startEdit(purchase({ id: 'purchase-1' }));

			expect(component.isEditing(purchase({ id: 'purchase-2' }))).toBe(false);
		});

		it('cancels editing', () => {
			const { component } = buildComponent();
			const item = purchase();
			component.startEdit(item);

			component.cancelEdit();

			expect(component.isEditing(item)).toBe(false);
		});

		it('saves the edit, coercing entered values, and clears min/max estimates', () => {
			const { component, save } = buildComponent();
			const item = purchase({ title: 'Old', year: 2026, estimatedCost: 100 });
			component.startEdit(item);
			component.editTitle.set('New title');
			component.editYear.set(2027);
			component.editEstimatedCost.set(300);
			const refreshed = vi.fn();
			component.refreshRequested.subscribe(refreshed);

			component.saveEdit(item);

			expect(save).toHaveBeenCalledWith(
				expect.objectContaining({ id: 'purchase-1', title: 'New title', year: 2027, estimatedCost: 300, minEstimatedCost: undefined, maxEstimatedCost: undefined })
			);
			expect(refreshed).toHaveBeenCalled();
			expect(component.isEditing(item)).toBe(false);
		});
	});

	describe('addInlinePurchase', () => {
		it('requests a fallback when there is no activity to attach to', () => {
			const { component, postObject$ } = buildComponent();
			const fallback = vi.fn();
			component.addFallbackRequested.subscribe(fallback);

			component.addInlinePurchase();

			expect(fallback).toHaveBeenCalled();
			expect(postObject$).not.toHaveBeenCalled();
		});

		it('creates and prepends a new purchase, then opens it for editing', () => {
			const { component, fixture, postObject$ } = buildComponent();
			fixture.componentRef.setInput('activityId', 'activity-9');
			const refreshed = vi.fn();
			component.refreshRequested.subscribe(refreshed);

			component.addInlinePurchase();

			expect(postObject$).toHaveBeenCalledTimes(1);
			const [payload] = postObject$.mock.calls[0];
			expect(payload).toMatchObject({ id: 'purchase-uuid', activityId: 'activity-9', title: 'New purchase', year: new Date().getFullYear(), estimatedCost: 0 });
			expect(component.explicitItems()?.[0]).toBe(payload);
			expect(component.isEditing(payload)).toBe(true);
			expect(refreshed).toHaveBeenCalled();
		});
	});

	describe('duplicatePurchase', () => {
		it('copies into the next year and opens it for editing', () => {
			const { component, postObject$ } = buildComponent();
			const original = purchase({ id: 'purchase-1', year: 2026 });
			component.explicitItems.set([original]);

			component.duplicatePurchase(original);

			const [payload] = postObject$.mock.calls[0];
			expect(payload).toMatchObject({ activityId: 'activity-1', year: 2027 });
			expect(payload.id).not.toBe('purchase-1');
			expect(component.explicitItems()?.[0]).toBe(payload);
			expect(component.isEditing(payload)).toBe(true);
		});
	});

	it('formats a keur amount with a comma decimal separator', () => {
		const { component } = buildComponent();
		expect(component.formatKeur(0.14)).toBe('0,14');
	});

	describe('totalBilledAmountKeur', () => {
		it('sums the billed amount of every explicit purchase', () => {
			const { component, fixture } = buildComponent();

			fixture.componentRef.setInput('explicitItems', [purchase({ id: 'a', year: 2026, estimatedCost: 100 }), purchase({ id: 'b', year: 2026, estimatedCost: 200 })]);
			TestBed.flushEffects();

			expect(component.totalBilledAmountKeur()).toBeCloseTo(0.14 + 0.28, 5);
		});

		it('is zero when there are no explicit purchases', () => {
			const { component, fixture } = buildComponent();

			fixture.componentRef.setInput('explicitItems', []);
			TestBed.flushEffects();

			expect(component.totalBilledAmountKeur()).toBe(0);
		});
	});
});
