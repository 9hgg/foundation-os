import { TranslationTableComponent } from './translation-table.component';

describe('TranslationTableComponent', () => {
	it('has the lib-translation-table selector', () => {
		const cmp = TranslationTableComponent as { ɵcmp?: { selectors: string[][] } };
		const selector = cmp.ɵcmp?.selectors?.[0]?.[0];
		expect(selector).toBe('lib-translation-table');
	});

	it('is a class constructor', () => {
		expect(typeof TranslationTableComponent).toBe('function');
	});
});
