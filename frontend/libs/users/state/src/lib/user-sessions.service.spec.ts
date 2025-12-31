import { TestBed } from '@angular/core/testing';
import { UserSessionsService } from './user-sessions.service';
import { AuthTokensRepository } from '@foundation/auth/state';
import { UsersRepository } from './users.repository';
import { Router } from '@angular/router';
import { NotificationService } from '@foundation/notification';
import { TranslationsRepository } from '@foundation/translations/state';
import { TranslationService } from '@foundation/translations/services';
import { TranslationTableComponent } from '@foundation/translations/ui';
import { TranslatePipe, TranslateDirective } from '@foundation/translations/services';
import { BehaviorSubject, of } from 'rxjs';

describe('UserSessionsService', () => {
	let service: UserSessionsService;

	beforeEach(() => {
		const authTokensRepoMock = {
			authTokenProps$$$: new BehaviorSubject({ availableAuthTokens: [], currentAuthToken: null }),
			logout: vi.fn(),
			setAuthTokenProps: vi.fn(),
		};

		const usersRepoMock = {
			connectedUsers$$$: { $: new BehaviorSubject([]) },
		};

		const routerMock = {
			navigate: vi.fn(),
		};

		const notificationServiceMock = {
			snackWarning: vi.fn(),
		};

		const translationServiceMock = {
			prep: vi.fn().mockReturnValue(() => 'translated string'),
		};

		TestBed.configureTestingModule({
			providers: [UserSessionsService, { provide: AuthTokensRepository, useValue: authTokensRepoMock }, { provide: UsersRepository, useValue: usersRepoMock }, { provide: Router, useValue: routerMock }, { provide: NotificationService, useValue: notificationServiceMock }, { provide: TranslationService, useValue: translationServiceMock }],
		});
		service = TestBed.inject(UserSessionsService);
	});

	it('should be created', () => {
		expect(service).toBeTruthy();
	});
});
