import { RequestService } from '@foundation/network/services';
import { TranslationService } from '@foundation/translations/services';
import { Injectable, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { skip, switchMap, tap, withLatestFrom } from 'rxjs';
import { UsersRepository } from './users.repository';

@Injectable({
	providedIn: 'root',
})
export class UserLanguageSyncService {
	private _translationService = inject(TranslationService);
	private _usersRepository = inject(UsersRepository);
	private _requestService = inject(RequestService);

	constructor() {
		this._initSync();
	}

	private _initSync() {
		// 1. When profile loads, update local language if configured
		this._usersRepository.currentProfile$$$
			.pipe(
				takeUntilDestroyed(),
				withLatestFrom(this._translationService.currentLangCode$$$.$),
				tap(([user, currentLang]) => {
					if (user?.config?.language) {
						if (user.config.language !== currentLang) {
							console.log('[UserLanguageSync] Syncing language from profile:', user.config.language);
							this._translationService.useLanguage(user.config.language);
						}
					}
				})
			)
			.subscribe();

		// 2. When language changes, update profile if logged in
		this._translationService.currentLangCode$$$.$.pipe(
			takeUntilDestroyed(),
			skip(1), // Skip initial value
			withLatestFrom(this._usersRepository.currentProfile$$$.$),
			switchMap(([lang, user]) => {
				if (user && user.config?.language !== lang) {
					console.log('[UserLanguageSync] Syncing language to profile:', lang);
					return this._requestService
						.post$('/api/users/profile/update', {
							config: { language: lang },
						})
						.pipe(
							tap(() => {
								// Optionally refresh user to confirm sync.
							})
						);
				}
				return [];
			})
		).subscribe();
	}
}
