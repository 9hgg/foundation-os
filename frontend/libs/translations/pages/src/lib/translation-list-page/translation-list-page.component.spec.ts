import { TranslationListPageComponent } from './translation-list-page.component';

describe('TranslationListPageComponent', () => {
	it('has the lib-translation-list-page selector', () => {
		const cmp = TranslationListPageComponent as { ɵcmp?: { selectors: string[][] } };
		const selector = cmp.ɵcmp?.selectors?.[0]?.[0];
		expect(selector).toBe('lib-translation-list-page');
	});

	it('is a class constructor', () => {
		expect(typeof TranslationListPageComponent).toBe('function');
	});
});
