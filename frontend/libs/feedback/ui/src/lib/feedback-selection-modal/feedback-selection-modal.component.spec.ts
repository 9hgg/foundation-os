import { FeedbackSelectionModalComponent, FeedbackSelectionItem } from './feedback-selection-modal.component';

const items: FeedbackSelectionItem[] = [
	{ slug: 'billing', key: 'Billing', seenCount: 3, answeredCount: 1 },
	{ slug: 'bug-report', key: 'Bug report', seenCount: 2, answeredCount: 2 },
	{ slug: 'feature', key: 'Feature request', seenCount: 1, answeredCount: 0 },
];

function createComponent(selectedSlugs: string[] = []) {
	const dialogRef = { close: vi.fn() } as never;
	return new FeedbackSelectionModalComponent(dialogRef, { items, selectedSlugs });
}

describe('FeedbackSelectionModalComponent', () => {
	it('filters by slug or display key, case-insensitively', () => {
		const component = createComponent();
		component.searchTerm.set('BUG');
		expect(component.filteredItems().map((item) => item.slug)).toEqual(['bug-report']);
		component.searchTerm.set('request');
		expect(component.filteredItems().map((item) => item.slug)).toEqual(['feature']);
	});

	it('initializes, toggles, selects filtered items, and clears selections', () => {
		const component = createComponent(['billing']);
		expect(component.isSelected('billing')).toBe(true);
		component.toggleSelection('billing');
		expect(component.isSelected('billing')).toBe(false);
		component.searchTerm.set('bug');
		component.selectAllFiltered();
		expect(component.isSelected('bug-report')).toBe(true);
		expect(component.isSelected('feature')).toBe(false);
		component.clearAll();
		expect(component.selectedSlugSet()).toEqual({});
	});

	it('closes with selected slugs on save and without a result on cancel', () => {
		const dialogRef = { close: vi.fn() };
		const component = new FeedbackSelectionModalComponent(dialogRef as never, { items, selectedSlugs: ['feature'] });
		component.save();
		expect(dialogRef.close).toHaveBeenCalledWith({ selectedSlugs: ['feature'] });
		component.cancel();
		expect(dialogRef.close).toHaveBeenLastCalledWith();
	});
});
