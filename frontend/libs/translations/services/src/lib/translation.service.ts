import { RequestService } from '@foundation/network/services';
import { BehaviorSubjectReplayed, StateStorage, localStorageStrategy } from '@foundation/utils';
import { Injectable, inject } from '@angular/core';
import { cloneDeep } from 'lodash-es';
import { NEVER, Observable, combineLatest, debounceTime, from, map, of, shareReplay, startWith, switchMap, take, tap } from 'rxjs';

const DEBUG = false;
const DEFAULT_LANG_CODE: string = 'en';
const PREVENT_TRANSLATION = false;

/** coming from pipe or directive */
interface TranslatableSentence {
	/** value from the template */
	inputSentence: string;
	/** optional target language override */
	langCode?: string;
	/** source language of inputSentence */
	inputLanguage: string;
	/** key-value dict to fill the rawSentence */
	kv?: Record<string, string>;
	/** replace placeholders before translation (default to false in the backend) */
	rpbt?: boolean;
	/** translation context */
	translationContext?: string;
}

/** local conversion to know how to process and what to return */
interface SentenceToTranslate extends TranslatableSentence {
	/** the sentenceToTranslate is a conversion from the input sentence depending on rpbt */
	sentenceToTranslate: string;
	/** target language to translate to */
	langCode: string;
}

interface SentenceTranslated extends SentenceToTranslate {
	/** the translated sentence (may or may not contains § ) */
	rawTranslatedSentence: string;
}

interface Translations {
	/** we use the sentenceToTranslate as unique key */
	[sentenceToTranslateHash: string]: {
		details: TranslatableSentence;
		availableLangCodes: {
			/** this is the translated sentence for the specifc langCode */
			[langCode: string]: string;
		};
	};
}

@Injectable({
	providedIn: 'root',
})
export class TranslationService {
	private _requestService = inject(RequestService);
	currentLangCode$$$ = new BehaviorSubjectReplayed<string>(DEFAULT_LANG_CODE);
	availableTranslations$$$ = new BehaviorSubjectReplayed<Translations>({});
	missingTranslations$$$ = new BehaviorSubjectReplayed<SentenceToTranslate[]>([]);

	private _verifiedTranslations = new Set<string>();
	translationsToVerify$$$ = new BehaviorSubjectReplayed<SentenceToTranslate[]>([]);

	constructor() {
		// read the token from the storage
		const storage: StateStorage = localStorageStrategy;
		const storeName = 'translation';
		from(storage.getItem(storeName)).subscribe((value) => {
			if (value) {
				this.availableTranslations$$$.next(value);
			}
		});

		this._detectBrowserLanguage();

		this.currentLangCode$$$
			.pipe(
				tap((langCode) => {
					if (DEBUG) console.log('%c[TranslationService] currentLanguage', 'color: cyan', langCode);
				})
			)
			.subscribe();

		if (!PREVENT_TRANSLATION)
			this.missingTranslations$$$
				.pipe(
					tap((missingTranslations) => {
						if (DEBUG) console.log('%c[TranslationService] missingTranslations', 'color: cyan', missingTranslations);
					}),
					debounceTime(300),
					switchMap((missingTranslations) => {
						if (missingTranslations.length > 0) {
							const missingTranslationsAlreadyRequested = missingTranslations.filter((missingTranslation) => this._convertSentenceToTranslateToHash(missingTranslation) in this.availableTranslations$$$.value && missingTranslation.langCode in this.availableTranslations$$$.value[this._convertSentenceToTranslateToHash(missingTranslation)].availableLangCodes);
							if (DEBUG) console.log('%c[TranslationService] missingTranslationsAlreadyRequested', 'color: cyan', missingTranslationsAlreadyRequested);
							const missingTranslationsToRequest = missingTranslations.filter((missingTranslation) => !(this._convertSentenceToTranslateToHash(missingTranslation) in this.availableTranslations$$$.value) || (this._convertSentenceToTranslateToHash(missingTranslation) in this.availableTranslations$$$.value && !(missingTranslation.langCode in this.availableTranslations$$$.value[this._convertSentenceToTranslateToHash(missingTranslation)].availableLangCodes)));
							if (DEBUG) console.log('%c[TranslationService] missingTranslationsToRequest', 'color: cyan', missingTranslationsToRequest);
							return this.requestTranslations$(missingTranslationsToRequest);
						}
						return NEVER;
					})
				)
				.subscribe();

		this.translationsToVerify$$$
			.pipe(
				debounceTime(2000), // wait a bit to batch
				switchMap((translationsToVerify) => {
					if (translationsToVerify.length > 0) {
						if (DEBUG) console.log('%c[TranslationService] Verifying translations (background)', 'color: orange', translationsToVerify);
						// We filter out duplicates in the batch
						const uniqueTranslationsToVerify = translationsToVerify.filter((v, i, a) => a.findIndex((t) => t.inputSentence === v.inputSentence && t.langCode === v.langCode && t.inputLanguage === v.inputLanguage && t.translationContext === v.translationContext) === i);
						// clear the list for next batch
						this.translationsToVerify$$$.next([]);
						return this.requestTranslations$(uniqueTranslationsToVerify);
					}
					return NEVER;
				})
			)
			.subscribe();

		this.availableTranslations$$$
			.pipe(
				tap((availableTranslations) => {
					storage.setItem(storeName, availableTranslations);
				})
			)
			.subscribe();
	}

	private _detectBrowserLanguage(): void {
		// Try to get from local storage first
		const storage = localStorageStrategy;
		from(storage.getItem<{ code: string }>('translation_lang')).subscribe((stored) => {
			if (stored?.code) {
				this.currentLangCode$$$.next(stored.code);
			} else {
				// Fallback to browser language if no stored language
				const preferredLanguages = navigator.languages;
				for (const lang of preferredLanguages) {
					const langCode = lang.split('-')[0]; // Get the language code (e.g., "en" from "en-US")
					this.currentLangCode$$$.next(langCode);
					break;
				}
			}
		});
	}

	useLanguage(lang: string): void {
		let langCode = lang;
		if (langCode.includes('-')) {
			langCode = lang.split('-')[0]; // Get the language code (e.g., "en" from "en-US")
		}
		this.currentLangCode$$$.next(langCode);
		localStorageStrategy.setItem('translation_lang', { code: langCode });
	}

	private _convertSentenceToTranslateToHash(sentenceToTranslate: TranslatableSentence) {
		const sentenceToTranslateHash = sentenceToTranslate.inputSentence + (sentenceToTranslate.translationContext ? '{{' + sentenceToTranslate.translationContext + '}}' : '');
		return sentenceToTranslateHash;
	}

	requestTranslations$(sentencesToTranslate: SentenceToTranslate[]) {
		return this._requestService.post$<SentenceTranslated[], SentenceToTranslate[]>('/api/translations/translate/multiple', sentencesToTranslate).pipe(
			map((response) => {
				if (response.error) {
					alert(response.error.title);
					return [];
				}
				if (DEBUG) console.log('%c[TranslationService] requestTranslations$', 'color: cyan', response);
				return response.result ?? [];
			}),
			tap((sentencesTranslated) => {
				if (DEBUG) console.log('%c[TranslationService] requestTranslations$ tap', 'color: cyan', sentencesTranslated);
				// add translations to availableTranslations
				const availableTranslations = cloneDeep(this.availableTranslations$$$.value);
				for (const sentenceTranslated of sentencesTranslated) {
					if (DEBUG) console.log('%c[TranslationService] requestTranslations$ tap proccesing', 'color: cyan', sentenceTranslated);

					const sentenceTranslatedhash = this._convertSentenceToTranslateToHash(sentenceTranslated);

					if (!(sentenceTranslatedhash in availableTranslations)) {
						availableTranslations[sentenceTranslatedhash] = {
							details: {
								inputSentence: sentenceTranslated.sentenceToTranslate,
								inputLanguage: sentenceTranslated.inputLanguage || 'en',
								kv: sentenceTranslated.kv,
								rpbt: sentenceTranslated.rpbt,
								translationContext: sentenceTranslated.translationContext,
							},
							availableLangCodes: {},
						};
					}
					availableTranslations[sentenceTranslatedhash].availableLangCodes[sentenceTranslated.langCode] = sentenceTranslated.rawTranslatedSentence;
				}
				if (DEBUG) console.log({ availableTranslations });

				this.availableTranslations$$$.next(availableTranslations);
			})
		);
	}

	fillPlaceholders(sentenceWithPlaceholders: string, kv: Record<string, string>): string {
		// a translatable sentence may contains words prefixed with §, if yes: we replace them with the corresponding value in kv

		let sentenceFilled = sentenceWithPlaceholders;
		for (const key in kv) {
			const value = kv[key];
			// replace all occurences of §key with value
			sentenceFilled = sentenceFilled.replaceAll('§' + key, value);
		}
		if (DEBUG) console.log('%c[TranslationService] fillPlaceholders', 'color: cyan', sentenceWithPlaceholders, kv, '->', sentenceFilled);
		return sentenceFilled;
	}

	translate$(translatableSentence: TranslatableSentence, sanitize = true): Observable<string> {
		if (DEBUG) console.log('You want to translate this:', translatableSentence);

		return combineLatest([this.currentLangCode$$$.$, this.availableTranslations$$$.$]).pipe(
			tap(([lang, translations]) => {
				if (DEBUG) console.log('combineLatest', lang, translations);
			}),
			switchMap(([langCode, translations]) => {
				const inputLanguage = translatableSentence.inputLanguage.includes('-') ? translatableSentence.inputLanguage.split('-')[0] : translatableSentence.inputLanguage;
				const requestedLangCode = translatableSentence.langCode?.includes('-') ? translatableSentence.langCode.split('-')[0] : translatableSentence.langCode;
				const targetLangCode = requestedLangCode ?? langCode;

				// check key in translations

				let sentenceToTranslate: string = translatableSentence.inputSentence;
				if (translatableSentence.rpbt) {
					sentenceToTranslate = this.fillPlaceholders(translatableSentence.inputSentence, translatableSentence.kv ?? {});
				}

				const sentenceToTranslateHash = this._convertSentenceToTranslateToHash(translatableSentence);

				if (sentenceToTranslateHash in translations) {
					if (DEBUG) console.log('%c[TranslationService] Raw sentence found,', 'color: cyan', sentenceToTranslate);
					if (targetLangCode in translations[sentenceToTranslateHash].availableLangCodes) {
						if (DEBUG) console.log('%c[TranslationService] lang available,', 'color: cyan', sentenceToTranslate, targetLangCode);
						const rawTranslatedSentence = translations[sentenceToTranslateHash].availableLangCodes[targetLangCode];
						if (translations[sentenceToTranslateHash].details.rpbt) {
							if (DEBUG) console.log("%c[TranslationService] replacement was done in the backend, we don't need to do it here", 'color: cyan', rawTranslatedSentence);

							// BACKGROUND VERIFICATION
							this.triggerVerification({
								...translatableSentence,
								sentenceToTranslate: translatableSentence.inputSentence, // approx but ok for verification context
								langCode: targetLangCode,
								inputLanguage,
							});

							return of(rawTranslatedSentence);
						} else {
							if (DEBUG) console.log('%c[TranslationService] replacement was not done in the backend, we need to do it here', 'color: cyan', rawTranslatedSentence, { kv: translatableSentence.kv });

							// BACKGROUND VERIFICATION
							this.triggerVerification({
								...translatableSentence,
								sentenceToTranslate: translatableSentence.inputSentence,
								langCode: targetLangCode,
								inputLanguage,
							});

							return of(this.fillPlaceholders(rawTranslatedSentence, translatableSentence.kv ?? {}));
						}
					} else {
						if (DEBUG) console.log('%c[TranslationService] lang not available yet,', 'color: cyan', targetLangCode);
						// add it to the list of missing translations if not already present
						const newMissingTranslation: SentenceToTranslate = {
							...translatableSentence,
							sentenceToTranslate,
							langCode: targetLangCode,
							inputLanguage,
						};
						if (!this.missingTranslations$$$.value.some((missingTranslation) => missingTranslation.sentenceToTranslate === newMissingTranslation.sentenceToTranslate && missingTranslation.langCode === newMissingTranslation.langCode && missingTranslation.inputLanguage === newMissingTranslation.inputLanguage && missingTranslation.translationContext === newMissingTranslation.translationContext)) {
							this.missingTranslations$$$.next([...this.missingTranslations$$$.value, newMissingTranslation]);
						}

						// if another language is available, we return it
						// first we look in preferred languages
						const preferredLanguages = navigator.languages;
						for (const preferredLang of preferredLanguages) {
							const preferredLangCode = preferredLang.split('-')[0]; // Get the language code
							if (preferredLangCode in translations[sentenceToTranslateHash].availableLangCodes) {
								if (DEBUG) console.log('%c[TranslationService] Preferred language found, returning', 'color: cyan', preferredLangCode, 'instead of', targetLangCode);
								const rawTranslatedSentence = translations[sentenceToTranslateHash].availableLangCodes[preferredLangCode];
								if (translations[sentenceToTranslateHash].details.rpbt) {
									if (DEBUG) console.log("%c[TranslationService](alternative preferred) replacement was done in the backend, we don't need to do it here", 'color: cyan', rawTranslatedSentence, preferredLangCode);
									return of(rawTranslatedSentence);
								} else {
									if (DEBUG) console.log('%c[TranslationService](alternative preferred) replacement was not done in the backend, we need to do it here', 'color: cyan', rawTranslatedSentence, preferredLangCode, { kv: translatableSentence.kv });
									return of(this.fillPlaceholders(rawTranslatedSentence, translatableSentence.kv ?? {}));
								}
							}
						} // end of preferred languages
						// then we look in all already translated languages
						for (const langCodeFallback in translations[sentenceToTranslateHash].availableLangCodes) {
							if (DEBUG) console.log('No preferred language found, returning', langCodeFallback, 'instead of', targetLangCode);
							const rawTranslatedSentence = translations[sentenceToTranslateHash].availableLangCodes[langCodeFallback];
							if (translations[sentenceToTranslateHash].details.rpbt) {
								if (DEBUG) console.log("%c[TranslationService](alternative fallback) replacement was done in the backend, we don't need to do it here", 'color: cyan', rawTranslatedSentence, rawTranslatedSentence);
								return of(rawTranslatedSentence);
							} else {
								if (DEBUG) console.log('%c[TranslationService](alternative fallback) replacement was not done in the backend, we need to do it here', 'color: cyan', rawTranslatedSentence, rawTranslatedSentence, { kv: translatableSentence.kv });
								return of(this.fillPlaceholders(rawTranslatedSentence, translatableSentence.kv ?? {}));
							}
						}

						return NEVER;
					}
				} else {
					if (DEBUG) console.log('%c[TranslationService] Translation not found yet: adding to the list of translations', 'color: cyan', sentenceToTranslate);
					const newMissingTranslation: SentenceToTranslate = {
						...translatableSentence,
						sentenceToTranslate,
						langCode: targetLangCode,
						inputLanguage,
					};
					// we add it to the list of missing translations if not already present
					if (!this.missingTranslations$$$.value.some((missingTranslation) => missingTranslation.sentenceToTranslate === newMissingTranslation.sentenceToTranslate && missingTranslation.langCode === newMissingTranslation.langCode && missingTranslation.inputLanguage === newMissingTranslation.inputLanguage && missingTranslation.translationContext === newMissingTranslation.translationContext)) {
						this.missingTranslations$$$.next([...this.missingTranslations$$$.value, newMissingTranslation]);
					}
					return NEVER;
				}
			}),
			startWith(this.fillPlaceholders(translatableSentence.inputSentence, translatableSentence.kv ?? {}))
		);
	}

	/**
	 * triggerVerification
	 */
	public triggerVerification(translatableSentence: SentenceToTranslate) {
		const hash = this._convertSentenceToTranslateToHash(translatableSentence) + '_' + translatableSentence.langCode + '_' + translatableSentence.inputLanguage;
		if (this._verifiedTranslations.has(hash)) {
			return;
		}
		this._verifiedTranslations.add(hash);
		this.translationsToVerify$$$.next([...this.translationsToVerify$$$.value, translatableSentence]);
	}

	/**
	 * Prepares a translatable sentence to be translated and return an object with a read method.
	 *
	 * (will return quickly)
	 * @param translatableSentence
	 */
	prep$(
		/** value from the template */
		inputSentence: string,
		/** key-value dict to fill the rawSentence */
		kv?: Record<string, string>,
		// replace placeholders before translation (default to false in the backend)
		rpbt?: boolean,
		translationContext?: string
	) {
		const translatableSentence: TranslatableSentence = {
			inputSentence,
			kv,
			rpbt,
			translationContext,
			inputLanguage: 'en',
		};
		const a = this.translate$(translatableSentence).pipe(shareReplay({ refCount: true, bufferSize: 1 }));
		a.subscribe();
		return a.pipe(take(1));
	}

	quickMemoizer: { [key: string]: string } = {};
	/**
	 * Prep the sentence and return a function to get the translated sentence (no need to subscribe).
	 * @param inputSentence
	 * @param kv
	 * @param rpbt
	 * @param translationContext
	 * @returns
	 */
	prep(
		/** value from the template */
		inputSentence: string,
		/** key-value dict to fill the rawSentence */
		kv?: Record<string, string>,
		/** replace placeholders before translation (default to false in the backend)*/
		rpbt?: boolean,
		/** */
		translationContext?: string
	) {
		const translatableSentence: TranslatableSentence = {
			inputSentence,
			kv,
			rpbt,
			translationContext,
			inputLanguage: 'en',
		};

		const inputSentenceHash = inputSentence + (translatableSentence.translationContext ? '{{' + translatableSentence.translationContext + '}}' : '');

		this.quickMemoizer[inputSentenceHash] = inputSentence;
		const traductionSubscription = this.translate$(translatableSentence).pipe(
			tap((v) => {
				this.quickMemoizer[inputSentenceHash] = v;
			}),
			take(3), // in case alternative languages trigger first
			shareReplay({ refCount: true, bufferSize: 1 })
		);
		traductionSubscription.subscribe();
		return () => this.quickMemoizer[inputSentenceHash];
	}
}
