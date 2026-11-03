import { TestBed } from '@angular/core/testing';
import { ContributorsRepository } from '@edf/edf-project-rands/state';
import { BehaviorSubject } from 'rxjs';
import { CategoryEnum } from '@edf/edf-project-rands/models';
import { ContributorCostPillComponent } from './contributor-cost-pill.component';

describe('ContributorCostPillComponent', () => {
	const buildFixture = (loaded: unknown = { id: 'contributor-1', firstName: 'Ada', lastName: 'Lovelace', category: CategoryEnum.B }) => {
		const contributor$ = new BehaviorSubject<unknown>(loaded);
		const getObjectByIdPullOnce$$$ = vi.fn(() => ({ $: contributor$ }));

		TestBed.configureTestingModule({ providers: [{ provide: ContributorsRepository, useValue: { store: { getObjectByIdPullOnce$$$ } } }] });
		TestBed.overrideComponent(ContributorCostPillComponent, { set: { template: '', imports: [], styles: [] } });

		const fixture = TestBed.createComponent(ContributorCostPillComponent);
		return { fixture, component: fixture.componentInstance, getObjectByIdPullOnce$$$, contributor$ };
	};

	afterEach(() => TestBed.resetTestingModule());

	it('resolves the contributor by id, its public name and its category', () => {
		const { fixture, component, getObjectByIdPullOnce$$$ } = buildFixture();
		fixture.componentRef.setInput('contributorId', 'contributor-1');
		fixture.componentRef.setInput('year', 2026);
		fixture.detectChanges();

		expect(getObjectByIdPullOnce$$$).toHaveBeenCalledWith('contributor-1');
		expect(component.contributorPublicName()).toBe('Ada Lovelace');
		expect(component.contributorCategory()).toBe(CategoryEnum.B);
	});

	it('falls back to the email, then the id, when the contributor has no name', () => {
		const { fixture, component } = buildFixture({ id: 'contributor-1', email: 'ada@example.test' });
		fixture.componentRef.setInput('contributorId', 'contributor-1');
		fixture.componentRef.setInput('year', 2026);
		fixture.detectChanges();
		expect(component.contributorPublicName()).toBe('ada@example.test');
	});

	it('truncates a name longer than the maximum', () => {
		const { fixture, component } = buildFixture({ id: 'contributor-1', firstName: 'a'.repeat(40), lastName: '' });
		fixture.componentRef.setInput('contributorId', 'contributor-1');
		fixture.componentRef.setInput('year', 2026);
		fixture.componentRef.setInput('maxLength', 10);
		fixture.detectChanges();

		expect(component.contributorPublicNameTruncated()).toBe('aaaaaaaaaa...');
	});

	describe('cost computations for a covered year', () => {
		it('computes daily cost, billed amount and the formula labels', () => {
			const { fixture, component } = buildFixture();
			fixture.componentRef.setInput('contributorId', 'contributor-1');
			fixture.componentRef.setInput('year', 2026);
			fixture.componentRef.setInput('numberOfdays', 10);
			fixture.detectChanges();

			expect(component.dailyCostLabel()).not.toBe('—');
			expect(component.dailyBilledAmountLabel()).not.toBe('—');
			expect(component.billedAmountLabel()).not.toBe('—');
			expect(component.getBilledAmountKeur()).not.toBeNull();
			expect(component.formulaLabel()).toMatch(/×/);
			expect(component.formulaHtml()).toContain('<strong>');
		});
	});

	describe('cost computations for an uncovered year', () => {
		it('falls back to a dash and null everywhere', () => {
			const { fixture, component } = buildFixture();
			fixture.componentRef.setInput('contributorId', 'contributor-1');
			fixture.componentRef.setInput('year', 1999);
			fixture.componentRef.setInput('numberOfdays', 10);
			fixture.detectChanges();

			expect(component.dailyCostLabel()).toBe('—');
			expect(component.dailyBilledAmountLabel()).toBe('—');
			expect(component.billedAmountLabel()).toBe('—');
			expect(component.getBilledAmountKeur()).toBeNull();
			expect(component.formulaLabel()).toBe('—');
			expect(component.formulaHtml()).toBe('—');
		});
	});

	it('is a dash when there is no category or no day count', () => {
		const { fixture, component } = buildFixture(null);
		fixture.componentRef.setInput('contributorId', 'contributor-1');
		fixture.componentRef.setInput('year', 2026);
		fixture.detectChanges();

		expect(component.dailyCostLabel()).toBe('—');
		expect(component.billedAmountLabel()).toBe('—');
	});

	it('stops listening once destroyed', () => {
		const { fixture, component } = buildFixture();
		fixture.componentRef.setInput('contributorId', 'contributor-1');
		fixture.componentRef.setInput('year', 2026);
		fixture.detectChanges();

		expect(() => component.ngOnDestroy()).not.toThrow();
	});
});
