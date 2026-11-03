import { InjectionToken } from '@angular/core';

/**
 * The first route segment under which a signed-in user's dashboard lives (e.g. `host` in
 * `/host/dashboard/...`). It is declared once in the app's route config; features should
 * reference this token instead of hardcoding the literal, so the segment can be renamed or
 * moved in a single place. Defaults to `'host'` to match the current spOken route config.
 */
export const USER_ROOT_PATH = new InjectionToken<string>('USER_ROOT_PATH', {
	providedIn: 'root',
	factory: () => 'host',
});
