import { AppConfigService } from '@foundation/app/config';
import { ConnectionStateService } from '@foundation/network/services';
import { NotificationService } from '@foundation/notification';
import { DOCUMENT } from '@angular/common';
import { Injectable, Renderer2, RendererFactory2, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, NavigationEnd, Router } from '@angular/router';
import { filter, skip, tap } from 'rxjs/operators';

@Injectable({
	providedIn: 'root',
})
export class LayoutService {
	private _router = inject(Router);
	private _activatedRoute = inject(ActivatedRoute);
	private _connectionStateService = inject(ConnectionStateService);
	private _notificationService = inject(NotificationService);

	displayOfflinePill = signal(false);

	rootHeaderVisible = signal(false); // 100px
	rootHeaderHeightPx = signal(100);
	rootPlayerVisible = signal(false); // 100px
	rootPlayerHeightPx = signal(100);
	rootFooterVisible = signal(false); // 100px
	rootFooterHeightPx = signal(50);

	dashboardHeaderVisible = signal(false);
	dashboardHeaderHeightPx = signal(64);
	dashboardFooterVisible = signal(false);
	dashboardFooterHeightPx = signal(64);

	displayFloatingChat = signal(true);

	rootHeightLeft = computed(() => {
		const headerHeight = this.rootHeaderVisible() ? this.rootHeaderHeightPx() : 0;
		const playerHeight = this.rootPlayerVisible() ? this.rootPlayerHeightPx() : 0;
		const footerHeight = this.rootFooterVisible() ? this.rootFooterHeightPx() : 0;
		return `calc(100% - ${headerHeight}px - ${playerHeight}px - ${footerHeight}px)`;
	});

	dashboardHeightLeft = computed(() => {
		const headerHeight = this.dashboardHeaderVisible() ? this.dashboardHeaderHeightPx() : 0;
		const footerHeight = this.dashboardFooterVisible() ? this.dashboardFooterHeightPx() : 0;
		return `calc(100% - ${headerHeight}px - ${footerHeight}px)`;
	});

	// used in dashboard-host-page.component.html
	navBarVisible = signal(true);

	private _appConfig = inject(AppConfigService);
	private _document = inject(DOCUMENT);
	private _rendererFactory = inject(RendererFactory2);
	private _renderer = this._rendererFactory.createRenderer(null, null);

	// Theme management
	public theme = signal<string>('');
	public lightThemePref = signal<string>('');
	public darkThemePref = signal<string>('');
	public mode = signal<'light' | 'dark' | 'system'>('system');

	// Track system preference specifically
	public systemPref = signal<'light' | 'dark'>('light'); // default, will be init immediately

	// The actual mode being displayed (resolved from system if needed)
	public effectiveMode = computed(() => (this.mode() === 'system' ? this.systemPref() : this.mode()));

	constructor() {
		this._connectionStateService.connected$$.pipe(skip(1)).subscribe((connected) => {
			if (connected) {
				this._notificationService.snack('You are back online.', undefined, { dialogTarget: 'connection-state' });
			} else {
				this._notificationService.warning('You are offline.', undefined, { dialogTarget: 'connection-state' });
			}
		});

		this.initTheme();
		this.initVisibilities();

		this._connectionStateService.connected$$
			.pipe(
				tap((connected) => {
					this.displayOfflinePill.set(!connected);
				})
			)
			.subscribe();
	}

	public setTheme(theme: string) {
		// Legacy method, mostly for when we blindly set a theme.
		const currentEffectiveMode = this.effectiveMode();
		if (currentEffectiveMode === 'dark') {
			this.updateDarkTheme(theme);
		} else {
			this.updateLightTheme(theme);
		}
	}

	public updateLightTheme(theme: string) {
		this.lightThemePref.set(theme);
		localStorage.setItem('app_theme_light', theme);
		this.setMode('light');
	}

	public setLightThemePref(theme: string) {
		this.lightThemePref.set(theme);
		localStorage.setItem('app_theme_light', theme);
		if (this.effectiveMode() === 'light') {
			this.applyModeTheme('light');
		}
	}

	public updateDarkTheme(theme: string) {
		this.darkThemePref.set(theme);
		localStorage.setItem('app_theme_dark', theme);
		this.setMode('dark');
	}

	public setDarkThemePref(theme: string) {
		this.darkThemePref.set(theme);
		localStorage.setItem('app_theme_dark', theme);
		if (this.effectiveMode() === 'dark') {
			this.applyModeTheme('dark');
		}
	}

	public setMode(mode: 'light' | 'dark' | 'system') {
		this.mode.set(mode);
		localStorage.setItem('app_mode', mode);

		if (mode === 'system') {
			this.applySystemTheme();
		} else {
			this.applyModeTheme(mode);
		}
	}

	private initTheme() {
		const env = this._appConfig.config$_?.environment;

		// Initialize preferences
		const savedLight = localStorage.getItem('app_theme_light') || env?.defaultLightTheme || 'light';
		const savedDark = localStorage.getItem('app_theme_dark') || env?.defaultDarkTheme || 'dark';
		this.lightThemePref.set(savedLight);
		this.darkThemePref.set(savedDark);

		// Initialize System Pref
		const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
		this.systemPref.set(mediaQuery.matches ? 'dark' : 'light');

		// Listen for system changes always
		mediaQuery.addEventListener('change', (e) => {
			this.systemPref.set(e.matches ? 'dark' : 'light');
			if (this.mode() === 'system') {
				this.applySystemTheme();
			}
		});

		const savedMode = localStorage.getItem('app_mode') as 'light' | 'dark' | 'system' | null;
		if (savedMode) {
			this.mode.set(savedMode);
		}

		if (savedMode === 'system' || !savedMode) {
			this.applySystemTheme();
		} else {
			this.applyModeTheme(savedMode);
		}
	}

	private applyModeTheme(mode: 'light' | 'dark') {
		const themeToUse = mode === 'dark' ? this.darkThemePref() : this.lightThemePref();
		this.theme.set(themeToUse);
		this._renderer.setAttribute(this._document.documentElement, 'data-theme', themeToUse);
	}

	private applySystemTheme() {
		this.applyModeTheme(this.systemPref());
	}

	displayRootHeader(value: boolean = true) {
		this.rootHeaderVisible.set(value);
	}

	displayRootPlayer(value: boolean = true) {
		this.rootPlayerVisible.set(value);
	}

	displayDashboardLeftMenu(value: boolean = true) {
		this.navBarVisible.set(value);
	}

	displayRootFooter(value: boolean = true) {
		this.rootFooterVisible.set(value);
	}
	displayDashboardHeader(value: boolean = true) {
		this.dashboardHeaderVisible.set(value);
	}
	displayDashboardFooter(value: boolean = true) {
		this.dashboardFooterVisible.set(value);
	}

	private initVisibilities() {
		this._router.events.pipe(filter((event) => event instanceof NavigationEnd)).subscribe(() => {
			// Get the deepest active route
			let route = this._activatedRoute.firstChild;
			while (route?.firstChild) {
				route = route.firstChild;
			}

			const hideRootHeader = route?.snapshot?.data?.['hideRootHeader'] ?? !this.rootHeaderVisible();
			const hideRootFooter = route?.snapshot?.data?.['hideRootFooter'] ?? !this.rootFooterVisible();
			this.displayRootHeader(!hideRootHeader);
			this.displayRootFooter(!hideRootFooter);

			const hideNavBar = route?.snapshot?.data?.['hideNavBar'] ?? false;
			const hideDashboardHeader = route?.snapshot?.data?.['hideDashboardHeader'] ?? !this.dashboardHeaderVisible();
			const hideDashboardFooter = route?.snapshot?.data?.['hideDashboardFooter'] ?? !this.dashboardFooterVisible();
			this.displayDashboardLeftMenu(!hideNavBar);
			this.displayDashboardHeader(!hideDashboardHeader);
			this.displayDashboardFooter(!hideDashboardFooter);

			const hideFloatingChat = route?.snapshot?.data?.['hideFloatingChat'] ?? !this.displayFloatingChat();
			this.displayFloatingChat.set(!hideFloatingChat);
		});
	}
}
