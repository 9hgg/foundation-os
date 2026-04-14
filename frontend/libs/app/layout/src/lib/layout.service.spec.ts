import { TestBed } from '@angular/core/testing';
import { DOCUMENT } from '@angular/common';
import { RendererFactory2 } from '@angular/core';
import { ActivatedRoute, NavigationEnd, Router } from '@angular/router';
import { BehaviorSubject, Subject } from 'rxjs';
import { AppConfigService } from '@foundation/app/config';
import { ConnectionStateService } from '@foundation/network/services';
import { NotificationService } from '@foundation/notification';
import { LayoutService } from './layout.service';

describe('LayoutService', () => {
	let service: LayoutService;
	let routerEvents$: Subject<any>;
	let connected$$: BehaviorSubject<boolean>;
	let notificationServiceMock: { snack: ReturnType<typeof vi.fn>; warning: ReturnType<typeof vi.fn> };
	let rendererMock: {
		setAttribute: ReturnType<typeof vi.fn>;
		createElement: ReturnType<typeof vi.fn>;
	};
	let rendererFactoryMock: { createRenderer: ReturnType<typeof vi.fn> };
	let documentMock: { documentElement: { getAttribute: ReturnType<typeof vi.fn> } };

	beforeEach(() => {
		routerEvents$ = new Subject();
		connected$$ = new BehaviorSubject<boolean>(true);

		notificationServiceMock = {
			snack: vi.fn(),
			warning: vi.fn(),
		};

		rendererMock = {
			setAttribute: vi.fn(),
			createElement: vi.fn(),
		};

		rendererFactoryMock = {
			createRenderer: vi.fn().mockReturnValue(rendererMock),
		};

		documentMock = {
			documentElement: {
				getAttribute: vi.fn(),
			},
		};

		// Stub localStorage
		vi.spyOn(Storage.prototype, 'getItem').mockReturnValue(null);
		vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => undefined);

		// Stub window.matchMedia
		Object.defineProperty(window, 'matchMedia', {
			writable: true,
			value: vi.fn().mockReturnValue({
				matches: false,
				addEventListener: vi.fn(),
			}),
		});

		TestBed.configureTestingModule({
			providers: [
				LayoutService,
				{
					provide: Router,
					useValue: { events: routerEvents$.asObservable(), url: '' },
				},
				{
					provide: ActivatedRoute,
					useValue: { firstChild: null },
				},
				{
					provide: NotificationService,
					useValue: notificationServiceMock,
				},
				{
					provide: ConnectionStateService,
					useValue: { connected$$: connected$$ },
				},
				{
					provide: AppConfigService,
					useValue: { config$_: { environment: {} } },
				},
				{
					provide: RendererFactory2,
					useValue: rendererFactoryMock,
				},
				{
					provide: DOCUMENT,
					useValue: documentMock,
				},
			],
		});

		service = TestBed.inject(LayoutService);
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('should be created', () => {
		expect(service).toBeTruthy();
	});

	describe('signal defaults', () => {
		it('should have rootHeaderVisible default false', () => {
			expect(service.rootHeaderVisible()).toBe(false);
		});

		it('should have rootPlayerVisible default false', () => {
			expect(service.rootPlayerVisible()).toBe(false);
		});

		it('should have rootFooterVisible default false', () => {
			expect(service.rootFooterVisible()).toBe(false);
		});

		it('should have dashboardHeaderVisible default false', () => {
			expect(service.dashboardHeaderVisible()).toBe(false);
		});

		it('should have dashboardFooterVisible default false', () => {
			expect(service.dashboardFooterVisible()).toBe(false);
		});

		it('should have navBarVisible default true', () => {
			expect(service.navBarVisible()).toBe(true);
		});

		it('should have displayFloatingChat default true', () => {
			expect(service.displayFloatingChat()).toBe(true);
		});

		it('should have displayOfflinePill default false', () => {
			expect(service.displayOfflinePill()).toBe(false);
		});

		it('should have mode default system', () => {
			expect(service.mode()).toBe('system');
		});
	});

	describe('rootHeightLeft computed', () => {
		it('should return 100% minus nothing when all components hidden', () => {
			service.rootHeaderVisible.set(false);
			service.rootPlayerVisible.set(false);
			service.rootFooterVisible.set(false);
			expect(service.rootHeightLeft()).toBe('calc(100% - 0px - 0px - 0px)');
		});

		it('should subtract header height when header is visible', () => {
			service.rootHeaderVisible.set(true);
			service.rootPlayerVisible.set(false);
			service.rootFooterVisible.set(false);
			expect(service.rootHeightLeft()).toBe('calc(100% - 100px - 0px - 0px)');
		});

		it('should subtract player height when player is visible', () => {
			service.rootHeaderVisible.set(false);
			service.rootPlayerVisible.set(true);
			service.rootFooterVisible.set(false);
			expect(service.rootHeightLeft()).toBe('calc(100% - 0px - 100px - 0px)');
		});

		it('should subtract footer height when footer is visible', () => {
			service.rootHeaderVisible.set(false);
			service.rootPlayerVisible.set(false);
			service.rootFooterVisible.set(true);
			expect(service.rootHeightLeft()).toBe('calc(100% - 0px - 0px - 50px)');
		});

		it('should subtract all heights when all components are visible', () => {
			service.rootHeaderVisible.set(true);
			service.rootPlayerVisible.set(true);
			service.rootFooterVisible.set(true);
			expect(service.rootHeightLeft()).toBe('calc(100% - 100px - 100px - 50px)');
		});

		it('should use custom header height when set', () => {
			service.rootHeaderVisible.set(true);
			service.rootHeaderHeightPx.set(80);
			service.rootPlayerVisible.set(false);
			service.rootFooterVisible.set(false);
			expect(service.rootHeightLeft()).toBe('calc(100% - 80px - 0px - 0px)');
		});
	});

	describe('dashboardHeightLeft computed', () => {
		it('should return 100% minus nothing when both hidden', () => {
			service.dashboardHeaderVisible.set(false);
			service.dashboardFooterVisible.set(false);
			expect(service.dashboardHeightLeft()).toBe('calc(100% - 0px - 0px)');
		});

		it('should subtract header height when dashboard header is visible', () => {
			service.dashboardHeaderVisible.set(true);
			service.dashboardFooterVisible.set(false);
			expect(service.dashboardHeightLeft()).toBe('calc(100% - 64px - 0px)');
		});

		it('should subtract footer height when dashboard footer is visible', () => {
			service.dashboardHeaderVisible.set(false);
			service.dashboardFooterVisible.set(true);
			expect(service.dashboardHeightLeft()).toBe('calc(100% - 0px - 64px)');
		});

		it('should subtract both heights when both visible', () => {
			service.dashboardHeaderVisible.set(true);
			service.dashboardFooterVisible.set(true);
			expect(service.dashboardHeightLeft()).toBe('calc(100% - 64px - 64px)');
		});
	});

	describe('effectiveMode computed', () => {
		it('should return systemPref when mode is system and system is light', () => {
			service.mode.set('system');
			service.systemPref.set('light');
			expect(service.effectiveMode()).toBe('light');
		});

		it('should return systemPref when mode is system and system is dark', () => {
			service.mode.set('system');
			service.systemPref.set('dark');
			expect(service.effectiveMode()).toBe('dark');
		});

		it('should return light when mode is explicitly light', () => {
			service.mode.set('light');
			service.systemPref.set('dark');
			expect(service.effectiveMode()).toBe('light');
		});

		it('should return dark when mode is explicitly dark', () => {
			service.mode.set('dark');
			service.systemPref.set('light');
			expect(service.effectiveMode()).toBe('dark');
		});
	});

	describe('displayRootHeader()', () => {
		it('should set rootHeaderVisible to true by default', () => {
			service.displayRootHeader();
			expect(service.rootHeaderVisible()).toBe(true);
		});

		it('should set rootHeaderVisible to given value', () => {
			service.displayRootHeader(false);
			expect(service.rootHeaderVisible()).toBe(false);
		});

		it('should set rootHeaderVisible to true when true passed', () => {
			service.displayRootHeader(true);
			expect(service.rootHeaderVisible()).toBe(true);
		});
	});

	describe('displayRootPlayer()', () => {
		it('should set rootPlayerVisible to true by default', () => {
			service.displayRootPlayer();
			expect(service.rootPlayerVisible()).toBe(true);
		});

		it('should set rootPlayerVisible to false when false passed', () => {
			service.displayRootPlayer(false);
			expect(service.rootPlayerVisible()).toBe(false);
		});
	});

	describe('displayRootFooter()', () => {
		it('should set rootFooterVisible to true by default', () => {
			service.displayRootFooter();
			expect(service.rootFooterVisible()).toBe(true);
		});

		it('should set rootFooterVisible to false when false passed', () => {
			service.displayRootFooter(false);
			expect(service.rootFooterVisible()).toBe(false);
		});
	});

	describe('displayDashboardHeader()', () => {
		it('should set dashboardHeaderVisible to true by default', () => {
			service.displayDashboardHeader();
			expect(service.dashboardHeaderVisible()).toBe(true);
		});

		it('should set dashboardHeaderVisible to false when false passed', () => {
			service.displayDashboardHeader(false);
			expect(service.dashboardHeaderVisible()).toBe(false);
		});
	});

	describe('displayDashboardFooter()', () => {
		it('should set dashboardFooterVisible to true by default', () => {
			service.displayDashboardFooter();
			expect(service.dashboardFooterVisible()).toBe(true);
		});

		it('should set dashboardFooterVisible to false when false passed', () => {
			service.displayDashboardFooter(false);
			expect(service.dashboardFooterVisible()).toBe(false);
		});
	});

	describe('displayDashboardLeftMenu()', () => {
		it('should set navBarVisible to true by default', () => {
			service.displayDashboardLeftMenu();
			expect(service.navBarVisible()).toBe(true);
		});

		it('should set navBarVisible to false when false passed', () => {
			service.displayDashboardLeftMenu(false);
			expect(service.navBarVisible()).toBe(false);
		});
	});

	describe('updateLightTheme()', () => {
		it('should set lightThemePref signal', () => {
			service.updateLightTheme('corporate');
			expect(service.lightThemePref()).toBe('corporate');
		});

		it('should persist theme to localStorage', () => {
			service.updateLightTheme('corporate');
			expect(localStorage.setItem).toHaveBeenCalledWith('app_theme_light', 'corporate');
		});

		it('should switch mode to light', () => {
			service.updateLightTheme('corporate');
			expect(service.mode()).toBe('light');
		});
	});

	describe('updateDarkTheme()', () => {
		it('should set darkThemePref signal', () => {
			service.updateDarkTheme('dracula');
			expect(service.darkThemePref()).toBe('dracula');
		});

		it('should persist theme to localStorage', () => {
			service.updateDarkTheme('dracula');
			expect(localStorage.setItem).toHaveBeenCalledWith('app_theme_dark', 'dracula');
		});

		it('should switch mode to dark', () => {
			service.updateDarkTheme('dracula');
			expect(service.mode()).toBe('dark');
		});
	});

	describe('setMode()', () => {
		it('should set mode signal to light', () => {
			service.setMode('light');
			expect(service.mode()).toBe('light');
		});

		it('should set mode signal to dark', () => {
			service.setMode('dark');
			expect(service.mode()).toBe('dark');
		});

		it('should set mode signal to system', () => {
			service.setMode('system');
			expect(service.mode()).toBe('system');
		});

		it('should persist mode to localStorage', () => {
			service.setMode('dark');
			expect(localStorage.setItem).toHaveBeenCalledWith('app_mode', 'dark');
		});

		it('should apply renderer attribute when switching to light mode', () => {
			service.lightThemePref.set('corporate');
			service.setMode('light');
			expect(rendererMock.setAttribute).toHaveBeenCalledWith(
				documentMock.documentElement,
				'data-theme',
				'corporate'
			);
		});

		it('should apply renderer attribute when switching to dark mode', () => {
			service.darkThemePref.set('dracula');
			service.setMode('dark');
			expect(rendererMock.setAttribute).toHaveBeenCalledWith(
				documentMock.documentElement,
				'data-theme',
				'dracula'
			);
		});
	});

	describe('connection state integration', () => {
		it('should show snack when connection is restored', () => {
			connected$$.next(false);
			connected$$.next(true);
			expect(notificationServiceMock.snack).toHaveBeenCalledWith(
				'You are back online.',
				undefined,
				{ dialogTarget: 'connection-state' }
			);
		});

		it('should show warning when connection is lost', () => {
			connected$$.next(false);
			expect(notificationServiceMock.warning).toHaveBeenCalledWith(
				'You are offline.',
				undefined,
				{ dialogTarget: 'connection-state' }
			);
		});

		it('should set displayOfflinePill to true when disconnected', () => {
			connected$$.next(false);
			expect(service.displayOfflinePill()).toBe(true);
		});

		it('should set displayOfflinePill to false when reconnected', () => {
			connected$$.next(false);
			connected$$.next(true);
			expect(service.displayOfflinePill()).toBe(false);
		});
	});

	describe('NavigationEnd integration', () => {
		it('should update visibilities based on NavigationEnd events (no route data)', () => {
			service.rootHeaderVisible.set(true);
			service.rootFooterVisible.set(true);
			routerEvents$.next(new NavigationEnd(1, '/', '/'));
			// Without route data, defaults toggle based on current visibility
			// hideRootHeader = !(current rootHeaderVisible) = false → displayRootHeader(true)
			expect(service.rootHeaderVisible()).toBe(true);
			expect(service.rootFooterVisible()).toBe(true);
		});

		it('should not update visibilities on non-NavigationEnd events', () => {
			service.rootHeaderVisible.set(true);
			routerEvents$.next({ type: 0 }); // non-NavigationEnd
			expect(service.rootHeaderVisible()).toBe(true);
		});
	});
});
