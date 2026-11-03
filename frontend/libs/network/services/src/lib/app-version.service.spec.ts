import { PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { NavigationEnd, Router } from '@angular/router';
import { Subject } from 'rxjs';
import { APP_VERSION, AppVersionService } from './app-version.service';

describe('AppVersionService', () => {
	let events$: Subject<unknown>;
	let reload: ReturnType<typeof vi.fn>;

	function setup(currentVersion: string) {
		events$ = new Subject();
		window.sessionStorage.clear();

		TestBed.configureTestingModule({
			providers: [
				AppVersionService,
				{ provide: APP_VERSION, useValue: currentVersion },
				{ provide: Router, useValue: { events: events$.asObservable() } },
				{ provide: PLATFORM_ID, useValue: 'browser' },
			],
		});
		const service = TestBed.inject(AppVersionService);
		reload = vi.spyOn(service as unknown as { _reloadPage: () => void }, '_reloadPage').mockImplementation(() => undefined);
		return service;
	}

	it('flags outdated and reloads on the next navigation when versions differ', () => {
		const service = setup('aaaa111');
		service.check('bbbb222');
		expect(service.outdated()).toBe(true);
		expect(reload).not.toHaveBeenCalled();
		events$.next(new NavigationEnd(1, '/x', '/x'));
		expect(reload).toHaveBeenCalledTimes(1);
	});

	it('does nothing when the versions match', () => {
		const service = setup('aaaa111');
		service.check('aaaa111');
		expect(service.outdated()).toBe(false);
		events$.next(new NavigationEnd(1, '/x', '/x'));
		expect(reload).not.toHaveBeenCalled();
	});

	it('ignores a dev build', () => {
		const service = setup('dev');
		service.check('bbbb222');
		expect(service.outdated()).toBe(false);
	});

	it('ignores a missing server version', () => {
		const service = setup('aaaa111');
		service.check(null);
		expect(service.outdated()).toBe(false);
	});

	it('reloads at most once within the cooldown', () => {
		const service = setup('aaaa111');
		service.check('bbbb222');
		events$.next(new NavigationEnd(1, '/x', '/x'));
		events$.next(new NavigationEnd(2, '/y', '/y'));
		expect(reload).toHaveBeenCalledTimes(1);
	});
});
