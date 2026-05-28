import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { LeoparHeaderComponent } from './leopar-header.component';
import { AuthTokensRepository } from '@foundation/auth/state';
import { UsersRepository } from '@foundation/users/state';
import { RouterModule } from '@angular/router';
import { TranslationService } from '@foundation/translations/services';

const DEFAULT_AUTH_PROPS = {
	currentAuthToken: null,
	availableAuthTokens: [],
};

const mockAuthTokensRepository = {
	authTokenProps$$$: of(DEFAULT_AUTH_PROPS),
	selectCurrentToken: vi.fn(),
	logout: vi.fn(),
};

const mockUsersRepository = {
	currentProfile: vi.fn().mockReturnValue(null),
	connectedUsers$$$: of([]),
};

describe('LeoparHeaderComponent', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		TestBed.configureTestingModule({
			imports: [LeoparHeaderComponent, RouterModule.forRoot([])],
			providers: [
				{ provide: AuthTokensRepository, useValue: mockAuthTokensRepository },
				{ provide: UsersRepository, useValue: mockUsersRepository },
				{ provide: TranslationService, useValue: { prep: vi.fn().mockReturnValue(() => 'translated'), instant: vi.fn().mockReturnValue('translated'), translate$: vi.fn().mockReturnValue(of('translated')), useLanguage: vi.fn(), currentLanguage$: of('en') } },
			],
		});
	});

	it('creates', () => {
		const fixture = TestBed.createComponent(LeoparHeaderComponent);
		fixture.detectChanges();
		expect(fixture.componentInstance).toBeTruthy();
	});

	it('has isMenuOpen initially false', () => {
		const fixture = TestBed.createComponent(LeoparHeaderComponent);
		const component = fixture.componentInstance;
		expect(component.isMenuOpen).toBe(false);
	});

	it('currentUserAvatar returns undefined when no profile', () => {
		mockUsersRepository.currentProfile.mockReturnValue(null);
		const fixture = TestBed.createComponent(LeoparHeaderComponent);
		const component = fixture.componentInstance;
		fixture.detectChanges();
		expect(component.currentUserAvatar()).toBeUndefined();
	});

	it('logout calls authTokensRepository.logout', () => {
		const fixture = TestBed.createComponent(LeoparHeaderComponent);
		const component = fixture.componentInstance;
		fixture.detectChanges();
		component.logout();
		expect(mockAuthTokensRepository.logout).toHaveBeenCalled();
	});

	it('updateSelectedAccount calls selectCurrentToken', () => {
		const fixture = TestBed.createComponent(LeoparHeaderComponent);
		const component = fixture.componentInstance;
		fixture.detectChanges();
		const mockEvent = { target: { value: 'token123' } } as unknown as Event;
		component.updateSelectedAccount(mockEvent);
		expect(mockAuthTokensRepository.selectCurrentToken).toHaveBeenCalledWith('token123');
	});
});
