import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { BehaviorSubject, Observable, of } from 'rxjs';
import { ActivatedRoute, Router } from '@angular/router';
import { ClipboardService, NotificationService } from '@foundation/notification';
import { RequestService } from '@foundation/network/services';
import { createMockRequestService } from '@foundation/network/services/testing';
import { UsersRepository } from '@foundation/users/state';
import { UserBuilderPageComponent } from './user-builder-page.component';

const mockNotificationService = { snackError: vi.fn() };
const mockClipboardService = { copy: vi.fn(() => of(true)) };

const mockUsersRepository = {
        getUserByIdAsAdmin$: vi.fn(() => of(null)),
        getConnectAsLink$: vi.fn(() => of('https://spoken.systems/?authToken=token')),
};

const mockRouter = { navigate: vi.fn(), events: of(), url: '/' };
const mockRoute = { snapshot: { data: {} } };
const mockRequestService = createMockRequestService();

describe('UserBuilderPageComponent — static configuration', () => {
        beforeEach(() => {
                TestBed.configureTestingModule({
                        imports: [UserBuilderPageComponent],
                        providers: [
                                { provide: NotificationService, useValue: mockNotificationService },
                                { provide: ClipboardService, useValue: mockClipboardService },
                                { provide: UsersRepository, useValue: mockUsersRepository },
                                { provide: Router, useValue: mockRouter },
                                { provide: ActivatedRoute, useValue: mockRoute },
                                { provide: RequestService, useValue: mockRequestService },
                        ],
                });
        });

        function createInstance() {
                return TestBed.createComponent(UserBuilderPageComponent).componentInstance;
        }

        it('defines all five digest frequency options', () => {
                const instance = createInstance();
                expect(instance.digestFrequencies).toEqual(['never', 'hourly', 'daily', 'weekly', 'monthly']);
        });

        it('defines light, dark, and system theme modes in that order', () => {
                const instance = createInstance();
                expect(instance.themeModes).toEqual(['system', 'light', 'dark']);
        });

        it('defines exactly five supported languages', () => {
                const instance = createInstance();
                expect(instance.languages).toHaveLength(5);
        });

        it('includes English as a supported language', () => {
                const instance = createInstance();
                expect(instance.languages.some((l) => l.code === 'en')).toBe(true);
        });

        it('includes French (fr) as a supported language', () => {
                const instance = createInstance();
                expect(instance.languages.some((l) => l.code === 'fr')).toBe(true);
        });
});

describe('UserBuilderPageComponent — flag attributions', () => {
	/** Built off the prototype so the test drives _refreshFlagAttributions without TestBed wiring. */
	function buildComponent(flag$: Observable<unknown>) {
		const component = Object.create(UserBuilderPageComponent.prototype) as UserBuilderPageComponent;
		component['_flagAttributionsRepository'] = {
			listForUser$: () => of({ result: { data: [{ id: 'attribution-1', flagId: 'flag-1' }] } }),
		} as never;
		component['_flagsRepository'] = { store: { getObjectByIdPullOnce$$$: () => ({ $: flag$ }) } } as never;
		component['flagAttributions'] = signal([]) as never;
		return component;
	}

	it('fills in the flag when the store emits it, rather than sampling the initial null', () => {
		// The store seeds null and emits the flag once the pull lands. Reading only the first value
		// left the page rendering its fallback: the raw flag id.
		const flag$ = new BehaviorSubject<unknown>(null);
		const component = buildComponent(flag$.asObservable());

		component['_refreshFlagAttributions']('user-1');
		expect(component['flagAttributions']()[0].flag).toBeNull();

		flag$.next({ id: 'flag-1', key: 'rooms', title: 'Rooms' });

		expect(component['flagAttributions']()[0].flag?.key).toBe('rooms');
	});

	it('keeps a null flag when the store never resolves it (no rights, or deleted)', () => {
		const component = buildComponent(of(null));

		component['_refreshFlagAttributions']('user-1');

		expect(component['flagAttributions']()).toHaveLength(1);
		expect(component['flagAttributions']()[0].flag).toBeNull();
	});
});

// The two things you open someone's account to check, each behind its own linkable tab.
describe('UserBuilderPageComponent — tabs', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockRequestService.getObjectList$.mockReturnValue(of({ result: { data: [], total: 0 } }));
		TestBed.configureTestingModule({
			imports: [UserBuilderPageComponent],
			providers: [
				{ provide: NotificationService, useValue: mockNotificationService },
				{ provide: ClipboardService, useValue: mockClipboardService },
				{ provide: UsersRepository, useValue: mockUsersRepository },
				{ provide: Router, useValue: mockRouter },
				{ provide: ActivatedRoute, useValue: mockRoute },
				{ provide: RequestService, useValue: mockRequestService },
			],
		});
	});

	function build(userId: string | null = 'user-1') {
		const fixture = TestBed.createComponent(UserBuilderPageComponent);
		fixture.componentRef.setInput('userId', userId);
		fixture.detectChanges();
		return fixture;
	}

	it('opens on the profile and puts the tab in the URL', () => {
		const fixture = build();

		expect(fixture.componentInstance.activeTab()).toBe('profile');
		expect(mockRouter.navigate).toHaveBeenCalledWith([], expect.objectContaining({ queryParams: { activeTab: 'profile' } }));
	});

	it('reads the tickets of that user only, as an admin', () => {
		const fixture = build();

		fixture.componentInstance.activeTab.set('tickets');
		fixture.detectChanges();

		expect(mockRequestService.getObjectList$).toHaveBeenCalledWith('/api/articles', expect.objectContaining({ filters: ['author_id:user-1:exact'], bypass_acls: true }));
	});

	it('reads the subscriptions of that user only, as an admin', () => {
		const fixture = build();

		fixture.componentInstance.activeTab.set('subscriptions');
		fixture.detectChanges();

		expect(mockRequestService.getObjectList$).toHaveBeenCalledWith('/api/subscriptions', expect.objectContaining({ filters: ['beneficiary_id:user-1:exact'], bypass_acls: true }));
	});

	// The flag panel loads on its own; the tabs must not fetch until they are opened.
	it('reads neither tickets nor subscriptions until their tab is opened', () => {
		build();

		const endpoints = mockRequestService.getObjectList$.mock.calls.map((call) => call[0]);
		expect(endpoints).not.toContain('/api/articles');
		expect(endpoints).not.toContain('/api/subscriptions');
	});
});

describe('UserBuilderPageComponent — top bar', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockUsersRepository.getConnectAsLink$.mockReturnValue(of('https://spoken.systems/?authToken=token'));
		mockClipboardService.copy.mockReturnValue(of(true));
		TestBed.configureTestingModule({
			imports: [UserBuilderPageComponent],
			providers: [
				{ provide: NotificationService, useValue: mockNotificationService },
				{ provide: ClipboardService, useValue: mockClipboardService },
				{ provide: UsersRepository, useValue: mockUsersRepository },
				{ provide: Router, useValue: mockRouter },
				{ provide: ActivatedRoute, useValue: mockRoute },
				{ provide: RequestService, useValue: mockRequestService },
			],
		});
	});

	it('copies a connect-as link for the account being looked at', () => {
		const component = TestBed.createComponent(UserBuilderPageComponent).componentInstance;

		component.copyConnectAsLink('user-1');

		expect(mockUsersRepository.getConnectAsLink$).toHaveBeenCalledWith('user-1');
		expect(mockClipboardService.copy).toHaveBeenCalledWith('https://spoken.systems/?authToken=token', expect.anything());
	});

	it('warns instead of copying nothing when no link comes back', () => {
		mockUsersRepository.getConnectAsLink$.mockReturnValue(of(null));
		const component = TestBed.createComponent(UserBuilderPageComponent).componentInstance;

		component.copyConnectAsLink('user-1');

		expect(mockNotificationService.snackError).toHaveBeenCalled();
		expect(mockClipboardService.copy).not.toHaveBeenCalled();
	});

	// The badge shows eight characters; what lands in the clipboard is the whole id.
	it('copies the full id, not the shortened badge', () => {
		const component = TestBed.createComponent(UserBuilderPageComponent).componentInstance;

		component.copyUserId('01c09b2d-1111-2222-3333-444455556666');

		expect(mockClipboardService.copy).toHaveBeenCalledWith('01c09b2d-1111-2222-3333-444455556666', expect.anything());
	});
});
