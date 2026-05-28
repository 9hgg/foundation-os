import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { NotificationService } from '@foundation/notification';
import { TranslationService } from '@foundation/translations/services';
import { UsersRepository } from '@foundation/users/state';
import { UserListPageComponent } from './user-list-page.component';

const mockNotificationService = {
        snackError: vi.fn(),
};

const mockUsersRepository = {
        store: { getObjects$: vi.fn() },
};

const mockTranslationService = {
        prep: vi.fn().mockReturnValue(() => ''),
        currentLangCode$$$: { $: { pipe: vi.fn(), subscribe: vi.fn() } },
};

describe('UserListPageComponent', () => {
        beforeEach(() => {
                vi.clearAllMocks();
                TestBed.configureTestingModule({
                        imports: [UserListPageComponent],
                        providers: [
                                provideRouter([]),
                                { provide: NotificationService, useValue: mockNotificationService },
                                { provide: UsersRepository, useValue: mockUsersRepository },
                                { provide: TranslationService, useValue: mockTranslationService },
                        ],
                });
        });

        it('createNewUser calls snackError with "Not implemented" title', () => {
                const fixture = TestBed.createComponent(UserListPageComponent);
                fixture.componentInstance.createNewUser();
                expect(mockNotificationService.snackError).toHaveBeenCalledWith(
                        expect.any(String),
                        'Not implemented',
                );
        });

        it('goToUser calls snackError with "Not implemented" title', () => {
                const fixture = TestBed.createComponent(UserListPageComponent);
                fixture.componentInstance.goToUser('user-123');
                expect(mockNotificationService.snackError).toHaveBeenCalledWith(
                        expect.any(String),
                        'Not implemented',
                );
	});
});
