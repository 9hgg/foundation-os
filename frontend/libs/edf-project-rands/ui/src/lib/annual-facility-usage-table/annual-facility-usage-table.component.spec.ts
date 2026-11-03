import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { RequestService } from '@foundation/network/services';
import { NotificationService } from '@foundation/notification';
import { TranslationService } from '@foundation/translations/services';
import { DragAndDropService } from '@foundation/utils';
import { AnnualFacilityUsage } from '@edf/edf-project-rands/models';
import { AnnualFacilityUsagesRepository } from '@edf/edf-project-rands/state';
import { EMPTY, of } from 'rxjs';
import { AnnualFacilityUsageTableComponent } from './annual-facility-usage-table.component';

describe('annual-facility-usage-table.component', () => {
	const usage = (overrides: Partial<AnnualFacilityUsage> = {}): AnnualFacilityUsage => ({
		id: 'usage-1',
		activityId: 'activity-1',
		facilityId: 'facility-1',
		year: 2026,
		cost: 100,
		...overrides,
	});

	const buildComponent = () => {
		const save = vi.fn(() => of({}));
		const postObject$ = vi.fn((payload: AnnualFacilityUsage) => of({ result: { data: payload } }));

		TestBed.configureTestingModule({
			providers: [
				{
					provide: AnnualFacilityUsagesRepository,
					useValue: { store: { getObjects$: () => of({ data: [], totalCount: 0, page: 1 }), getObjectById$$$: () => ({ $: of(null) }), save, postObject$ } },
				},
				{ provide: Router, useValue: { navigate: vi.fn(), events: EMPTY } },
				{ provide: ActivatedRoute, useValue: { queryParams: of({}) } },
				{ provide: RequestService, useValue: {} },
				{ provide: NotificationService, useValue: {} },
				{ provide: TranslationService, useValue: { prep: (value: string) => () => value } },
				{ provide: DragAndDropService, useValue: {} },
			],
		});
		TestBed.overrideComponent(AnnualFacilityUsageTableComponent, { set: { template: '' } });

		const fixture = TestBed.createComponent(AnnualFacilityUsageTableComponent);
		fixture.detectChanges();
		const component = fixture.componentInstance;

		return { fixture, component, save, postObject$ };
	};

	afterEach(() => TestBed.resetTestingModule());

	it('emits a remove request and stops the triggering event', () => {
		const { component } = buildComponent();
		const item = usage();
		const event = { stopImmediatePropagation: vi.fn() } as unknown as Event;
		const spy = vi.fn();
		component.removeRequested.subscribe(spy);

		component.requestRemove(item, event);

		expect(spy).toHaveBeenCalledWith(item);
		expect(event.stopImmediatePropagation).toHaveBeenCalled();
	});

	describe('getOverheadCoefficient', () => {
		it('returns the known coefficient for a covered year', () => {
			const { component } = buildComponent();

			expect(component.getOverheadCoefficient(usage({ year: 2026 }))).toBe(1.38);
		});

		it('returns null instead of throwing for an uncovered year', () => {
			const { component } = buildComponent();

			expect(component.getOverheadCoefficient(usage({ year: 1999 }))).toBeNull();
		});
	});

	describe('getBilledAmountKeur', () => {
		it('applies the overhead coefficient to the cost', () => {
			const { component } = buildComponent();

			expect(component.getBilledAmountKeur(usage({ year: 2026, cost: 100 }))).toBe(0.14);
		});

		it('returns null when the year has no coefficient', () => {
			const { component } = buildComponent();

			expect(component.getBilledAmountKeur(usage({ year: 1999 }))).toBeNull();
		});
	});

	describe('formulaHtml', () => {
		it('renders the cost times coefficient formula', () => {
			const { component } = buildComponent();

			expect(component.formulaHtml(usage({ year: 2026, cost: 100 }))).toBe('100€ × 1.38 = <strong>0.14k€</strong>');
		});

		it('falls back to a dash for an uncovered year', () => {
			const { component } = buildComponent();

			expect(component.formulaHtml(usage({ year: 1999 }))).toBe('—');
		});
	});

	it('formats a keur amount with a comma decimal separator', () => {
		const { component } = buildComponent();

		expect(component.formatKeur(0.14)).toBe('0,14');
	});

	describe('editableYears', () => {
		it('merges the years already present with the surrounding default range, deduped and sorted descending', () => {
			const { component } = buildComponent();
			component.explicitItems.set([usage({ id: 'a', year: 2015 }), usage({ id: 'b', year: 2040 })]);

			const currentYear = new Date().getFullYear();
			const years = component.editableYears();

			expect(years[0]).toBe(2040);
			expect(years[years.length - 1]).toBe(2015);
			expect(years).toContain(currentYear);
			expect(new Set(years).size).toBe(years.length);
		});
	});

	describe('inline editing state', () => {
		it('starts editing by seeding the year and cost from the usage', () => {
			const { component } = buildComponent();
			const item = usage({ year: 2027, cost: 250 });

			component.startEdit(item);

			expect(component.isEditing(item)).toBe(true);
			expect(component.editYear()).toBe(2027);
			expect(component.editCost()).toBe(250);
		});

		it('is not editing an unrelated usage', () => {
			const { component } = buildComponent();
			component.startEdit(usage({ id: 'usage-1' }));

			expect(component.isEditing(usage({ id: 'usage-2' }))).toBe(false);
		});

		it('cancels editing', () => {
			const { component } = buildComponent();
			const item = usage();
			component.startEdit(item);

			component.cancelEdit();

			expect(component.isEditing(item)).toBe(false);
		});

		it('saves the edit, coercing the entered year and cost to numbers, and stops editing', () => {
			const { component, save } = buildComponent();
			const item = usage({ year: 2026, cost: 100 });
			component.startEdit(item);
			component.editYear.set('2027' as never);
			component.editCost.set('300' as never);
			const refreshed = vi.fn();
			component.refreshRequested.subscribe(refreshed);

			component.saveEdit(item);

			expect(save).toHaveBeenCalledWith(expect.objectContaining({ id: 'usage-1', year: 2027, cost: 300 }));
			expect(refreshed).toHaveBeenCalled();
			expect(component.isEditing(item)).toBe(false);
		});

		it('falls back to the previous year and to zero cost when the entered values do not parse to numbers', () => {
			const { component, save } = buildComponent();
			const item = usage({ year: 2026, cost: 100 });
			component.startEdit(item);
			component.editYear.set('not-a-year' as never);
			component.editCost.set('not-a-cost' as never);

			component.saveEdit(item);

			expect(save).toHaveBeenCalledWith(expect.objectContaining({ year: 2026, cost: 0 }));
		});
	});

	describe('addInlineUsage', () => {
		it('requests a fallback when there is no activity or facility to attach the usage to', () => {
			const { component, postObject$ } = buildComponent();
			const fallback = vi.fn();
			component.addFallbackRequested.subscribe(fallback);

			component.addInlineUsage();

			expect(fallback).toHaveBeenCalled();
			expect(postObject$).not.toHaveBeenCalled();
		});

		it('creates and prepends a new usage, then opens it for editing', () => {
			const { component, fixture, postObject$ } = buildComponent();
			fixture.componentRef.setInput('activityId', 'activity-9');
			component.explicitItems.set([usage({ id: 'existing', facilityId: 'facility-9' })]);
			const refreshed = vi.fn();
			component.refreshRequested.subscribe(refreshed);

			component.addInlineUsage();

			expect(postObject$).toHaveBeenCalledTimes(1);
			const [payload] = postObject$.mock.calls[0];
			expect(payload).toMatchObject({ activityId: 'activity-9', facilityId: 'facility-9', year: new Date().getFullYear(), cost: 0 });
			expect(component.explicitItems()?.[0]).toBe(payload);
			expect(component.isEditing(payload)).toBe(true);
			expect(refreshed).toHaveBeenCalled();
		});
	});

	describe('duplicateUsage', () => {
		it('copies the usage into next year and opens it for editing', () => {
			const { component, postObject$ } = buildComponent();
			const original = usage({ id: 'usage-1', year: 2026 });
			component.explicitItems.set([original]);

			component.duplicateUsage(original);

			const [payload] = postObject$.mock.calls[0];
			expect(payload).toMatchObject({ activityId: 'activity-1', facilityId: 'facility-1', year: 2027 });
			expect(payload.id).not.toBe('usage-1');
			expect(component.explicitItems()?.[0]).toBe(payload);
			expect(component.isEditing(payload)).toBe(true);
		});
	});

	describe('totalBilledAmountKeur', () => {
		it('sums the billed amount of every explicit usage', () => {
			const { component, fixture } = buildComponent();

			fixture.componentRef.setInput('explicitItems', [usage({ id: 'a', year: 2026, cost: 100 }), usage({ id: 'b', year: 2026, cost: 200 })]);
			TestBed.flushEffects();

			expect(component.totalBilledAmountKeur()).toBeCloseTo(0.14 + 0.28, 5);
		});

		it('skips usages whose year has no coefficient', () => {
			const { component, fixture } = buildComponent();

			fixture.componentRef.setInput('explicitItems', [usage({ id: 'a', year: 2026, cost: 100 }), usage({ id: 'b', year: 1999, cost: 999 })]);
			TestBed.flushEffects();

			expect(component.totalBilledAmountKeur()).toBeCloseTo(0.14, 5);
		});

		it('is zero when there are no explicit usages', () => {
			const { component, fixture } = buildComponent();

			fixture.componentRef.setInput('explicitItems', []);
			TestBed.flushEffects();

			expect(component.totalBilledAmountKeur()).toBe(0);
		});
	});
});
