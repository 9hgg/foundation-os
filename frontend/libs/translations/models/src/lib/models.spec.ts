import { Translation } from './models';

describe('Translation model', () => {
	it('has required string fields: hash, sourceContent, languageTarget', () => {
		const t: Translation = {
			id: '1',
			hash: 'abc123',
			sourceContent: 'Hello',
			languageSource: 'en',
			languageTarget: 'fr',
			translatedContent: 'Bonjour',
			translator: 'system',
			version: '1',
			translationContext: 'button',
		};
		expect(t.hash).toBe('abc123');
		expect(t.sourceContent).toBe('Hello');
		expect(t.languageTarget).toBe('fr');
	});

	it('accepts null for optional nullable fields', () => {
		const t: Translation = {
			id: '2',
			hash: 'xyz',
			sourceContent: 'Goodbye',
			languageSource: null,
			languageTarget: 'de',
			translatedContent: null,
			translator: null,
			version: null,
			translationContext: null,
		};
		expect(t.languageSource).toBeNull();
		expect(t.translatedContent).toBeNull();
		expect(t.translationContext).toBeNull();
	});

	it('inherits id from Resource', () => {
		const t: Translation = {
			id: 'res-001',
			hash: 'h1',
			sourceContent: 'text',
			languageSource: 'en',
			languageTarget: 'es',
			translatedContent: 'texto',
			translator: null,
			version: null,
			translationContext: null,
		};
		expect(t.id).toBe('res-001');
	});
});
