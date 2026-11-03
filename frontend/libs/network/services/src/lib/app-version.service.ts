import { isPlatformBrowser } from '@angular/common';
import { inject, Injectable, InjectionToken, PLATFORM_ID, signal } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs/operators';

/** The short git SHA the running frontend bundle was built from — provided by each
 * app from its generated environments/version.ts (RELEASE). */
export const APP_VERSION = new InjectionToken<string>('APP_VERSION');

const RELOAD_GUARD_KEY = 'app-version:reloaded-at';
const RELOAD_COOLDOWN_MS = 60_000;

@Injectable({ providedIn: 'root' })
export class AppVersionService {
	readonly outdated = signal(false);
	private _watching = false;
	private readonly _currentVersion = inject(APP_VERSION);
	private readonly _router = inject(Router);
	private readonly _platformId = inject(PLATFORM_ID);

	/** Compares the backend's advertised version (X-App-Version) to the one this
	 * bundle was built with. On a genuine mismatch the client is stale: flag it and
	 * reload at the next safe point (a route change) to pull the fresh bundle. */
	check(serverVersion: string | null | undefined): void {
		if (this.outdated() || !serverVersion || !this._currentVersion) return;
		if (this._currentVersion === 'dev' || serverVersion === 'dev') return;
		if (serverVersion === this._currentVersion) return;
		this.outdated.set(true);
		this._reloadOnNextNavigation();
	}

	private _reloadOnNextNavigation(): void {
		if (this._watching || !isPlatformBrowser(this._platformId)) return;
		this._watching = true;
		this._router.events.pipe(filter((event) => event instanceof NavigationEnd)).subscribe(() => this._reloadOnce());
	}

	private _reloadOnce(): void {
		if (!this._canReloadNow()) return;
		this._recordReload();
		this._reloadPage();
	}

	protected _reloadPage(): void {
		window.location.reload();
	}

	private _canReloadNow(): boolean {
		try {
			const lastReloadAt = Number(window.sessionStorage.getItem(RELOAD_GUARD_KEY) ?? '0');
			return !Number.isFinite(lastReloadAt) || Date.now() - lastReloadAt > RELOAD_COOLDOWN_MS;
		} catch {
			return false;
		}
	}

	private _recordReload(): void {
		try {
			window.sessionStorage.setItem(RELOAD_GUARD_KEY, String(Date.now()));
		} catch {
			// sessionStorage blocked — skip; the cooldown just won't persist.
		}
	}
}
