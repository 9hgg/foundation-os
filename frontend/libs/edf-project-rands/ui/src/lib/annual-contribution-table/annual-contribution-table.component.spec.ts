import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { RequestService } from '@foundation/network/services';
import { NotificationService } from '@foundation/notification';
import { TranslationService } from '@foundation/translations/services';
import { DragAndDropService } from '@foundation/utils';
import { AnnualContribution, CategoryEnum } from '@edf/edf-project-rands/models';
import { AnnualContributionsRepository, ContributorsRepository } from '@edf/edf-project-rands/state';
import { BehaviorSubject, EMPTY, of } from 'rxjs';
import { AnnualContributionTableComponent } from './annual-contribution-table.component';

describe('AnnualContributionTableComponent', () => {
	const contribution = (overrides: Partial<AnnualContribution> = {}): AnnualContribution => ({
		id: 'contribution-1',
		activityId: 'activity-1',
		contributorId: 'contributor-1',
		year: 2026,
		days: 10,
		...overrides,
	});

	const buildComponent = (category: CategoryEnum | null = CategoryEnum.B) => {
		const save = vi.fn(() => of({}));
		const postObject$ = vi.fn((payload: AnnualContribution) => of({ result: { data: payload } }));
		const contributor$ = new BehaviorSubject<{ category: CategoryEnum | null } | null>(category ? { category } : null);
		const getObjectById$$$ = vi.fn(() => ({ $: contributor$ }));

		TestBed.configureTestingModule({
			providers: [
				{
					provide: AnnualContributionsRepository,
					useValue: { store: { getObjects$: () => of({ data: [], totalCount: 0, page: 1 }), getObjectById$$$: () => ({ $: of(null) }), save, postObject$ } },
				},
				{ provide: ContributorsRepository, useValue: { store: { getObjectById$$$ } } },
				{ provide: Router, useValue: { navigate: vi.fn(), events: EMPTY } },
				{ provide: ActivatedRoute, useValue: { queryParams: of({}) } },
				{ provide: RequestService, useValue: {} },
				{ provide: NotificationService, useValue: {} },
				{ provide: TranslationService, useValue: { prep: (value: string) => () => value } },
				{ provide: DragAndDropService, useValue: {} },
			],
		});
		TestBed.overrideComponent(AnnualContributionTableComponent, { set: { template: '' } });

		const fixture = TestBed.createComponent(AnnualContributionTableComponent);
		fixture.detectChanges();
		const component = fixture.componentInstance;

		return { fixture, component, save, postObject$, contributor$ };
	};

	afterEach(() => TestBed.resetTestingModule());

	it('emits a remove request', () => {
		const { component } = buildComponent();
		const item = contribution();
		const spy = vi.fn();
		component.removeRequested.subscribe(spy);

		component.requestRemove(item);

		expect(spy).toHaveBeenCalledWith(item);
	});

	describe('availableYears / editableYears', () => {
		it('dedupes and sorts descending the years already present, merged with the default surrounding range', () => {
			const { component, fixture } = buildComponent();
			fixture.componentRef.setInput('explicitItems', [contribution({ id: 'a', year: 2015 }), contribution({ id: 'b', year: 2040 }), contribution({ id: 'c', year: 2015 })]);

			expect(component.availableYears()).toEqual([2040, 2015]);

			const years = component.editableYears();
			const currentYear = new Date().getFullYear();
			expect(years[0]).toBe(2040);
			expect(years[years.length - 1]).toBe(2015);
			expect(years).toContain(currentYear);
			expect(new Set(years).size).toBe(years.length);
		});
	});

	describe('inline editing state', () => {
		it('starts editing by seeding year and days', () => {
			const { component } = buildComponent();
			const item = contribution({ year: 2027, days: 15 });

			component.startEdit(item);

			expect(component.isEditing(item)).toBe(true);
			expect(component.editYear()).toBe(2027);
			expect(component.editDays()).toBe(15);
		});

		it('is not editing an unrelated contribution', () => {
			const { component } = buildComponent();
			component.startEdit(contribution({ id: 'contribution-1' }));

			expect(component.isEditing(contribution({ id: 'contribution-2' }))).toBe(false);
		});

		it('cancels editing', () => {
			const { component } = buildComponent();
			const item = contribution();
			component.startEdit(item);

			component.cancelEdit();

			expect(component.isEditing(item)).toBe(false);
		});

		it('saves the edit, coercing entered values, and stops editing', () => {
			const { component, save } = buildComponent();
			const item = contribution({ year: 2026, days: 10 });
			component.startEdit(item);
			component.editYear.set(2027);
			component.editDays.set(20);
			const refreshed = vi.fn();
			component.refreshRequested.subscribe(refreshed);

			component.saveEdit(item);

			expect(save).toHaveBeenCalledWith(expect.objectContaining({ id: 'contribution-1', year: 2027, days: 20 }));
			expect(refreshed).toHaveBeenCalled();
			expect(component.isEditing(item)).toBe(false);
		});
	});

	describe('addInlineContribution', () => {
		it('requests a fallback when there is no activity or contributor to attach to', () => {
			const { component, postObject$ } = buildComponent();
			const fallback = vi.fn();
			component.addFallbackRequested.subscribe(fallback);

			component.addInlineContribution();

			expect(fallback).toHaveBeenCalled();
			expect(postObject$).not.toHaveBeenCalled();
		});

		it('creates and prepends a new contribution, then opens it for editing', () => {
			const { component, fixture, postObject$ } = buildComponent();
			fixture.componentRef.setInput('activityId', 'activity-9');
			component.explicitItems.set([contribution({ id: 'existing', contributorId: 'contributor-9' })]);
			const refreshed = vi.fn();
			component.refreshRequested.subscribe(refreshed);

			component.addInlineContribution();

			expect(postObject$).toHaveBeenCalledTimes(1);
			const [payload] = postObject$.mock.calls[0];
			expect(payload).toMatchObject({ activityId: 'activity-9', contributorId: 'contributor-9', year: new Date().getFullYear(), days: 0 });
			expect(component.explicitItems()?.[0]).toBe(payload);
			expect(component.isEditing(payload)).toBe(true);
			expect(refreshed).toHaveBeenCalled();
		});
	});

	describe('duplicateContribution', () => {
		it('copies the contribution into the next year and opens it for editing', () => {
			const { component, postObject$ } = buildComponent();
			const original = contribution({ id: 'contribution-1', year: 2026 });
			component.explicitItems.set([original]);

			component.duplicateContribution(original);

			const [payload] = postObject$.mock.calls[0];
			expect(payload).toMatchObject({ contributorId: 'contributor-1', activityId: 'activity-1', year: 2027 });
			expect(payload.id).not.toBe('contribution-1');
			expect(component.explicitItems()?.[0]).toBe(payload);
			expect(component.isEditing(payload)).toBe(true);
		});
	});

	it('emits a contributor-change request', () => {
		const { component } = buildComponent();
		const item = contribution();
		const spy = vi.fn();
		component.contributorChangeRequested.subscribe(spy);

		component.requestContributorChange(item);

		expect(spy).toHaveBeenCalledWith(item);
	});

	it('formats a keur amount with a comma decimal separator', () => {
		const { component } = buildComponent();
		expect(component.formatKeur(1.4)).toBe('1,40');
	});

	describe('totalBilledAmountKeur', () => {
		it('sums the billed amount across contributions, resolving each contributor category', () => {
			const { component, fixture } = buildComponent(CategoryEnum.B);

			fixture.componentRef.setInput('explicitItems', [contribution({ id: 'a', year: 2026, days: 10 })]);
			TestBed.flushEffects();

			expect(component.totalBilledAmountKeur()).toBeGreaterThan(0);
		});

		it('is zero when the contributor has no category', () => {
			const { component, fixture } = buildComponent(null);

			fixture.componentRef.setInput('explicitItems', [contribution({ id: 'a', year: 2026, days: 10 })]);
			TestBed.flushEffects();

			expect(component.totalBilledAmountKeur()).toBe(0);
		});

		it('is zero when there are no explicit contributions', () => {
			const { component, fixture } = buildComponent();

			fixture.componentRef.setInput('explicitItems', []);
			TestBed.flushEffects();

			expect(component.totalBilledAmountKeur()).toBe(0);
		});
	});
});
