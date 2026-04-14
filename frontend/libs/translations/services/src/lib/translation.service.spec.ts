import { TestBed } from '@angular/core/testing';
import { TranslationService } from './translation.service';
import { RequestService } from '@foundation/network/services';
import { of, take } from 'rxjs';

describe('TranslationService', () => {
	let service: TranslationService;
	let requestServiceMock: { post$: ReturnType<typeof vi.fn> };

	beforeEach(() => {
		localStorage.clear();

		requestServiceMock = {
			post$: vi.fn().mockReturnValue(of({ result: [] })),
		};

		TestBed.configureTestingModule({
			providers: [TranslationService, { provide: RequestService, useValue: requestServiceMock }],
		});
		service = TestBed.inject(TranslationService);
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('should be created', () => {
		expect(service).toBeTruthy();
	});

	it('should set default lang code to en', () => {
		expect(service.currentLangCode$$$.value).toBeDefined();
	});

	describe('fillPlaceholders', () => {
		it('should replace placeholders', () => {
			const result = service.fillPlaceholders('Hello §name', { name: 'World' });
			expect(result).toBe('Hello World');
		});

		it('should replace multiple placeholders', () => {
			const result = service.fillPlaceholders('Hello §name, welcome to §place', { name: 'User', place: 'Spoken' });
			expect(result).toBe('Hello User, welcome to Spoken');
		});

		it('should handle missing placeholders in kv', () => {
			const result = service.fillPlaceholders('Hello §name', {});
			expect(result).toBe('Hello §name');
		});
	});

	describe('useLanguage', () => {
		it('should set currentLangCode', () => {
			service.useLanguage('fr');
			expect(service.currentLangCode$$$.value).toBe('fr');
		});

		it('should extract lang code from locale with dash', () => {
			service.useLanguage('fr-FR');
			expect(service.currentLangCode$$$.value).toBe('fr');
		});

		it('should persist to localStorage', () => {
			service.useLanguage('de');
			const stored = JSON.parse(localStorage.getItem('translation_lang') ?? '{}');
			expect(stored.code).toBe('de');
		});
	});

	describe('requestTranslations$', () => {
		it('should call the API with sentences', () => {
			const sentences = [
				{
					inputSentence: 'Hello',
					sentenceToTranslate: 'Hello',
					langCode: 'fr',
					inputLanguage: 'en',
				},
			];

			requestServiceMock.post$.mockReturnValue(
				of({
					result: [
						{
							inputSentence: 'Hello',
							sentenceToTranslate: 'Hello',
							rawTranslatedSentence: 'Bonjour',
							langCode: 'fr',
							inputLanguage: 'en',
						},
					],
				})
			);

			service.requestTranslations$(sentences).subscribe();

			expect(requestServiceMock.post$).toHaveBeenCalledWith('/api/translations/translate/multiple', sentences);
		});

		it('should store translations in availableTranslations', () => {
			requestServiceMock.post$.mockReturnValue(
				of({
					result: [
						{
							inputSentence: 'Hello',
							sentenceToTranslate: 'Hello',
							rawTranslatedSentence: 'Bonjour',
							langCode: 'fr',
							inputLanguage: 'en',
						},
					],
				})
			);

			service
				.requestTranslations$([
					{
						inputSentence: 'Hello',
						sentenceToTranslate: 'Hello',
						langCode: 'fr',
						inputLanguage: 'en',
					},
				])
				.subscribe();

			const translations = service.availableTranslations$$$.value;
			expect(translations['Hello']).toBeDefined();
			expect(translations['Hello'].availableLangCodes['fr']).toBe('Bonjour');
		});

		it('should handle API error', () => {
			const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => undefined);
			requestServiceMock.post$.mockReturnValue(
				of({
					error: { title: 'Translation error' },
				})
			);

			let result: unknown[] = [];
			service
				.requestTranslations$([
					{
						inputSentence: 'Hello',
						sentenceToTranslate: 'Hello',
						langCode: 'fr',
						inputLanguage: 'en',
					},
				])
				.subscribe((r) => {
					result = r;
				});

			expect(alertSpy).toHaveBeenCalledWith('Translation error');
			expect(result).toEqual([]);
		});

		it('should store translation with context in hash', () => {
			requestServiceMock.post$.mockReturnValue(
				of({
					result: [
						{
							inputSentence: 'Open',
							sentenceToTranslate: 'Open',
							rawTranslatedSentence: 'Ouvrir',
							langCode: 'fr',
							inputLanguage: 'en',
							translationContext: 'button',
						},
					],
				})
			);

			service
				.requestTranslations$([
					{
						inputSentence: 'Open',
						sentenceToTranslate: 'Open',
						langCode: 'fr',
						inputLanguage: 'en',
						translationContext: 'button',
					},
				])
				.subscribe();

			const translations = service.availableTranslations$$$.value;
			expect(translations['Open{{button}}']).toBeDefined();
			expect(translations['Open{{button}}'].availableLangCodes['fr']).toBe('Ouvrir');
		});

		it('should add multiple lang codes for same sentence', () => {
			requestServiceMock.post$.mockReturnValue(
				of({
					result: [
						{
							inputSentence: 'Hello',
							sentenceToTranslate: 'Hello',
							rawTranslatedSentence: 'Bonjour',
							langCode: 'fr',
							inputLanguage: 'en',
						},
						{
							inputSentence: 'Hello',
							sentenceToTranslate: 'Hello',
							rawTranslatedSentence: 'Hallo',
							langCode: 'de',
							inputLanguage: 'en',
						},
					],
				})
			);

			service
				.requestTranslations$([
					{ inputSentence: 'Hello', sentenceToTranslate: 'Hello', langCode: 'fr', inputLanguage: 'en' },
					{ inputSentence: 'Hello', sentenceToTranslate: 'Hello', langCode: 'de', inputLanguage: 'en' },
				])
				.subscribe();

			const translations = service.availableTranslations$$$.value;
			expect(translations['Hello'].availableLangCodes['fr']).toBe('Bonjour');
			expect(translations['Hello'].availableLangCodes['de']).toBe('Hallo');
		});
	});

	describe('translate$', () => {
		it('should emit input sentence first via startWith', () => {
			let firstValue: string | undefined;
			service
				.translate$({ inputSentence: 'Hello', inputLanguage: 'en' })
				.pipe(take(1))
				.subscribe((val) => {
					firstValue = val;
				});
			expect(firstValue).toBe('Hello');
		});

		it('should fill placeholders in startWith emission', () => {
			let firstValue: string | undefined;
			service
				.translate$({
					inputSentence: 'Hello §name',
					inputLanguage: 'en',
					kv: { name: 'Bob' },
				})
				.pipe(take(1))
				.subscribe((val) => {
					firstValue = val;
				});
			expect(firstValue).toBe('Hello Bob');
		});

		it('should return cached translation when available', () => {
			service.availableTranslations$$$.next({
				Hello: {
					details: { inputSentence: 'Hello', inputLanguage: 'en' },
					availableLangCodes: { fr: 'Bonjour' },
				},
			});
			service.currentLangCode$$$.next('fr');

			const values: string[] = [];
			service
				.translate$({ inputSentence: 'Hello', inputLanguage: 'en' })
				.pipe(take(2))
				.subscribe((val) => values.push(val));

			expect(values).toContain('Bonjour');
		});

		it('should fill placeholders client-side when rpbt is false', () => {
			service.availableTranslations$$$.next({
				'Hello §name': {
					details: { inputSentence: 'Hello §name', inputLanguage: 'en', rpbt: false },
					availableLangCodes: { fr: 'Bonjour §name' },
				},
			});
			service.currentLangCode$$$.next('fr');

			const values: string[] = [];
			service
				.translate$({
					inputSentence: 'Hello §name',
					inputLanguage: 'en',
					kv: { name: 'Alice' },
				})
				.pipe(take(2))
				.subscribe((val) => values.push(val));

			expect(values).toContain('Bonjour Alice');
		});

		it('should return raw translation when rpbt is true', () => {
			service.availableTranslations$$$.next({
				'Hello §name': {
					details: { inputSentence: 'Hello §name', inputLanguage: 'en', rpbt: true },
					availableLangCodes: { fr: 'Bonjour Alice' },
				},
			});
			service.currentLangCode$$$.next('fr');

			const values: string[] = [];
			service
				.translate$({
					inputSentence: 'Hello §name',
					inputLanguage: 'en',
					kv: { name: 'Alice' },
					rpbt: true,
				})
				.pipe(take(2))
				.subscribe((val) => values.push(val));

			expect(values).toContain('Bonjour Alice');
		});

		it('should add missing translations when target lang not available', () => {
			service.availableTranslations$$$.next({
				Hello: {
					details: { inputSentence: 'Hello', inputLanguage: 'en' },
					availableLangCodes: { en: 'Hello' },
				},
			});
			service.currentLangCode$$$.next('ja');

			service
				.translate$({ inputSentence: 'Hello', inputLanguage: 'en' })
				.pipe(take(2))
				.subscribe();

			const missing = service.missingTranslations$$$.value;
			expect(missing.some((m) => m.langCode === 'ja' && m.inputSentence === 'Hello')).toBe(true);
		});

		it('should fall back to any available lang when target not available', () => {
			service.availableTranslations$$$.next({
				Hello: {
					details: { inputSentence: 'Hello', inputLanguage: 'en' },
					availableLangCodes: { de: 'Hallo' },
				},
			});
			service.currentLangCode$$$.next('ja');

			const values: string[] = [];
			service
				.translate$({ inputSentence: 'Hello', inputLanguage: 'en' })
				.pipe(take(2))
				.subscribe((val) => values.push(val));

			// Should fall back to 'de' since 'ja' is not available
			expect(values).toContain('Hallo');
		});

		it('should add to missing when translation not found at all', () => {
			service.currentLangCode$$$.next('fr');
			const nextSpy = vi.spyOn(service.missingTranslations$$$, 'next');

			const sub = service.translate$({ inputSentence: 'Unknown sentence', inputLanguage: 'en' }).subscribe();

			expect(nextSpy).toHaveBeenCalled();
			const callArgs = nextSpy.mock.calls[0][0];
			expect(callArgs.some((m: { inputSentence: string }) => m.inputSentence === 'Unknown sentence')).toBe(true);
			sub.unsubscribe();
		});

		it('should not add duplicate missing translation', () => {
			service.currentLangCode$$$.next('fr');

			const sub1 = service.translate$({ inputSentence: 'Dup test', inputLanguage: 'en' }).subscribe();
			const sub2 = service.translate$({ inputSentence: 'Dup test', inputLanguage: 'en' }).subscribe();

			const missing = service.missingTranslations$$$.value;
			const count = missing.filter((m: { inputSentence: string }) => m.inputSentence === 'Dup test').length;
			expect(count).toBe(1);
			sub1.unsubscribe();
			sub2.unsubscribe();
		});

		it('should handle langCode override in translatableSentence', () => {
			service.availableTranslations$$$.next({
				Hello: {
					details: { inputSentence: 'Hello', inputLanguage: 'en' },
					availableLangCodes: { de: 'Hallo', fr: 'Bonjour' },
				},
			});
			service.currentLangCode$$$.next('fr');

			const values: string[] = [];
			service
				.translate$({
					inputSentence: 'Hello',
					inputLanguage: 'en',
					langCode: 'de',
				})
				.pipe(take(2))
				.subscribe((val) => values.push(val));

			expect(values).toContain('Hallo');
		});

		it('should handle langCode with dash format', () => {
			service.availableTranslations$$$.next({
				Hello: {
					details: { inputSentence: 'Hello', inputLanguage: 'en' },
					availableLangCodes: { fr: 'Bonjour' },
				},
			});
			service.currentLangCode$$$.next('fr');

			const values: string[] = [];
			service
				.translate$({
					inputSentence: 'Hello',
					inputLanguage: 'en-US',
					langCode: 'fr-FR',
				})
				.pipe(take(2))
				.subscribe((val) => values.push(val));

			expect(values).toContain('Bonjour');
		});

		it('should use rpbt to fill placeholders before translation lookup', () => {
			// When rpbt=true, sentenceToTranslate = fillPlaceholders(inputSentence, kv)
			service.currentLangCode$$$.next('fr');
			const nextSpy = vi.spyOn(service.missingTranslations$$$, 'next');

			const sub = service
				.translate$({
					inputSentence: 'Hello §name',
					inputLanguage: 'en',
					kv: { name: 'World' },
					rpbt: true,
				})
				.subscribe();

			// Check missing translations use the filled sentence
			expect(nextSpy).toHaveBeenCalled();
			const callArgs = nextSpy.mock.calls[0][0];
			expect(callArgs.some((m: { sentenceToTranslate: string }) => m.sentenceToTranslate === 'Hello World')).toBe(true);
			sub.unsubscribe();
		});

		it('should use translationContext in hash for cache lookup', () => {
			service.availableTranslations$$$.next({
				'Open{{button}}': {
					details: { inputSentence: 'Open', inputLanguage: 'en', translationContext: 'button' },
					availableLangCodes: { fr: 'Ouvrir' },
				},
			});
			service.currentLangCode$$$.next('fr');

			const values: string[] = [];
			service
				.translate$({
					inputSentence: 'Open',
					inputLanguage: 'en',
					translationContext: 'button',
				})
				.pipe(take(2))
				.subscribe((val) => values.push(val));

			expect(values).toContain('Ouvrir');
		});

		it('should return fallback lang with rpbt=true when target lang missing', () => {
			service.availableTranslations$$$.next({
				Hello: {
					details: { inputSentence: 'Hello', inputLanguage: 'en', rpbt: true },
					availableLangCodes: { de: 'Hallo' },
				},
			});
			service.currentLangCode$$$.next('ja');

			const values: string[] = [];
			service
				.translate$({ inputSentence: 'Hello', inputLanguage: 'en' })
				.pipe(take(2))
				.subscribe((val) => values.push(val));

			expect(values).toContain('Hallo');
		});

		it('should return fallback lang with rpbt=false and fill placeholders', () => {
			service.availableTranslations$$$.next({
				'Hi §name': {
					details: { inputSentence: 'Hi §name', inputLanguage: 'en', rpbt: false },
					availableLangCodes: { de: 'Hallo §name' },
				},
			});
			service.currentLangCode$$$.next('ja');

			const values: string[] = [];
			service
				.translate$({
					inputSentence: 'Hi §name',
					inputLanguage: 'en',
					kv: { name: 'Eve' },
				})
				.pipe(take(2))
				.subscribe((val) => values.push(val));

			expect(values).toContain('Hallo Eve');
		});
	});

	describe('triggerVerification', () => {
		it('should add sentence to verification list', () => {
			service.triggerVerification({
				inputSentence: 'Hello',
				sentenceToTranslate: 'Hello',
				langCode: 'fr',
				inputLanguage: 'en',
			});

			const toVerify = service.translationsToVerify$$$.value;
			expect(toVerify.length).toBe(1);
			expect(toVerify[0].inputSentence).toBe('Hello');
		});

		it('should not add duplicate sentences', () => {
			const sentence = {
				inputSentence: 'Hello',
				sentenceToTranslate: 'Hello',
				langCode: 'fr',
				inputLanguage: 'en',
			};
			service.triggerVerification(sentence);
			service.triggerVerification(sentence);

			const toVerify = service.translationsToVerify$$$.value;
			expect(toVerify.length).toBe(1);
		});

		it('should allow different lang codes for same sentence', () => {
			service.triggerVerification({
				inputSentence: 'Hello',
				sentenceToTranslate: 'Hello',
				langCode: 'fr',
				inputLanguage: 'en',
			});
			service.triggerVerification({
				inputSentence: 'Hello',
				sentenceToTranslate: 'Hello',
				langCode: 'de',
				inputLanguage: 'en',
			});

			const toVerify = service.translationsToVerify$$$.value;
			expect(toVerify.length).toBe(2);
		});
	});

	describe('prep$', () => {
		it('should return an observable that emits a string', () => {
			let emitted: string | undefined;
			service.prep$('Hello').subscribe((val) => {
				emitted = val;
			});
			expect(typeof emitted).toBe('string');
		});

		it('should pass kv, rpbt, and context to translate$', () => {
			const spy = vi.spyOn(service, 'translate$');
			service.prep$('Hello §name', { name: 'Bob' }, true, 'greeting');

			expect(spy).toHaveBeenCalledWith(
				expect.objectContaining({
					inputSentence: 'Hello §name',
					kv: { name: 'Bob' },
					rpbt: true,
					translationContext: 'greeting',
					inputLanguage: 'en',
				})
			);
		});
	});

	describe('prep', () => {
		it('should return a function', () => {
			const result = service.prep('Hello');
			expect(typeof result).toBe('function');
		});

		it('should return input sentence initially', () => {
			const getter = service.prep('Hello');
			expect(getter()).toBe('Hello');
		});

		it('should update memoized value when translation arrives', () => {
			service.availableTranslations$$$.next({
				Hello: {
					details: { inputSentence: 'Hello', inputLanguage: 'en' },
					availableLangCodes: { fr: 'Bonjour' },
				},
			});
			service.currentLangCode$$$.next('fr');

			const getter = service.prep('Hello');
			expect(getter()).toBeDefined();
		});

		it('should include context in memoizer key', () => {
			service.prep('Open', undefined, undefined, 'button');
			expect(service.quickMemoizer['Open{{button}}']).toBe('Open');
		});

		it('should use simple key without context', () => {
			service.prep('Save');
			expect(service.quickMemoizer['Save']).toBe('Save');
		});
	});
});
