import { TestBed } from '@angular/core/testing';
import { BehaviorSubject, of } from 'rxjs';
import { UserLanguageSyncService } from './user-language-sync.service';
import { UsersRepository } from './users.repository';
import { TranslationService } from '@foundation/translations/services';
import { RequestService } from '@foundation/network/services';

describe('UserLanguageSyncService', () => {
        let currentProfileSubject: BehaviorSubject<unknown>;
        let currentLangSubject: BehaviorSubject<string>;
        let useLanguage: ReturnType<typeof vi.fn>;
        let post$: ReturnType<typeof vi.fn>;

        beforeEach(() => {
                currentProfileSubject = new BehaviorSubject<unknown>(null);
                currentLangSubject = new BehaviorSubject<string>('en');
                useLanguage = vi.fn();
                post$ = vi.fn().mockReturnValue(of({}));

                TestBed.configureTestingModule({
                        providers: [
                                UserLanguageSyncService,
                                {
                                        provide: UsersRepository,
                                        useValue: { currentProfile$$$: currentProfileSubject },
                                },
                                {
                                        provide: TranslationService,
                                        useValue: {
                                                currentLangCode$$$: { $: currentLangSubject.asObservable() },
                                                useLanguage,
                                        },
                                },
                                {
                                        provide: RequestService,
                                        useValue: { post$ },
                                },
                        ],
                });
        });

        it('creates the service', () => {
                const service = TestBed.inject(UserLanguageSyncService);
                expect(service).toBeTruthy();
        });

        it('calls useLanguage when user profile has a different language than current', () => {
                TestBed.inject(UserLanguageSyncService);
                currentProfileSubject.next({ config: { language: 'fr' } });
                expect(useLanguage).toHaveBeenCalledWith('fr');
        });

        it('does not call useLanguage when user language matches current language', () => {
                TestBed.inject(UserLanguageSyncService);
                currentProfileSubject.next({ config: { language: 'en' } });
                expect(useLanguage).not.toHaveBeenCalled();
        });

        it('does not call useLanguage when user has no language config', () => {
                TestBed.inject(UserLanguageSyncService);
                currentProfileSubject.next({ config: {} });
                expect(useLanguage).not.toHaveBeenCalled();
        });

        it('does not call useLanguage when user is null', () => {
                TestBed.inject(UserLanguageSyncService);
                currentProfileSubject.next(null);
                expect(useLanguage).not.toHaveBeenCalled();
        });

        it('calls post$ to persist language when current language changes while logged in', () => {
                TestBed.inject(UserLanguageSyncService);
                // First set up a logged-in user with language 'en'
                currentProfileSubject.next({ config: { language: 'en' } });
                // Now change the app language — skip(1) means the first emission is skipped
                currentLangSubject.next('es');
                expect(post$).toHaveBeenCalledWith('/api/users/profile/update', { config: { language: 'es' } });
	});
});
