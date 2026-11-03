import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { LayoutService } from '@foundation/app/layout';
import { AuthTokensRepository } from '@foundation/auth/state';
import { AccessService } from '@foundation/shared/access';
import { UsersRepository } from '@foundation/users/state';
import { of } from 'rxjs';
import { LeoparDashboardHostPageComponent } from './dashboard-host-page.component';

describe('LeoparDashboardHostPageComponent', () => {
	const router = { navigate: vi.fn() };
	const users = { currentProfile: vi.fn() };
	const authTokensRepository = { logout: vi.fn() };

	beforeEach(() => {
		vi.clearAllMocks();
		users.currentProfile.mockReturnValue({ pseudo: 'Ada', email: 'ada@example.test', config: {} });
		TestBed.configureTestingModule({
			providers: [
				{ provide: Router, useValue: router },
				{ provide: UsersRepository, useValue: users },
				{ provide: AuthTokensRepository, useValue: authTokensRepository },
				{ provide: LayoutService, useValue: {} },
				{ provide: AccessService, useValue: { checkAdmin$: () => of(true) } },
			],
		});
	});

	it('derives the display name from the pseudo when present', () => {
		const component = TestBed.runInInjectionContext(() => new LeoparDashboardHostPageComponent());
		expect(component.currentUserDisplay()).toBe('Ada');
		expect(component.showPseudoNotification()).toBe(false);
		expect(component.isAdmin()).toBe(true);
	});

	it('falls back to the email when there is no pseudo', () => {
		users.currentProfile.mockReturnValue({ pseudo: undefined, email: 'ada@example.test', config: {} });
		const component = TestBed.runInInjectionContext(() => new LeoparDashboardHostPageComponent());
		expect(component.currentUserDisplay()).toBe('ada@example.test');
		expect(component.showPseudoNotification()).toBe(true);
	});

	it('falls back to Unknown User when there is no profile at all', () => {
		users.currentProfile.mockReturnValue(undefined);
		const component = TestBed.runInInjectionContext(() => new LeoparDashboardHostPageComponent());
		expect(component.currentUserDisplay()).toBe('Unknown User');
		expect(component.showPseudoNotification()).toBe(true);
	});

	it('treats a blank pseudo the same as a missing one', () => {
		users.currentProfile.mockReturnValue({ pseudo: '   ', email: 'ada@example.test', config: {} });
		const component = TestBed.runInInjectionContext(() => new LeoparDashboardHostPageComponent());
		expect(component.showPseudoNotification()).toBe(true);
	});

	it('has no avatar when the profile has no picture', () => {
		const component = TestBed.runInInjectionContext(() => new LeoparDashboardHostPageComponent());
		expect(component.currentUserAvatar()).toBeUndefined();
	});

	it('derives an avatar url from a configured profile picture', () => {
		users.currentProfile.mockReturnValue({ pseudo: 'Ada', email: 'ada@example.test', config: { profilePictureId: 'file-1' } });
		const component = TestBed.runInInjectionContext(() => new LeoparDashboardHostPageComponent());
		expect(component.currentUserAvatar()).toContain('file-1');
	});

	it('logs out and clears the session', () => {
		// jsdom's window.location is non-configurable in this workspace, so the `window.location.href
		// = '/'` redirect is a no-op here; just assert the session-clearing side effect it guards.
		const component = TestBed.runInInjectionContext(() => new LeoparDashboardHostPageComponent());
		expect(() => component.logout()).not.toThrow();
		expect(authTokensRepository.logout).toHaveBeenCalled();
	});

	it('navigates to the profile page', () => {
		const component = TestBed.runInInjectionContext(() => new LeoparDashboardHostPageComponent());
		component.navigateToProfile();
		expect(router.navigate).toHaveBeenCalledWith(['/host/dashboard/profile']);
	});
});
