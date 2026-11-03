import { HttpEvent, HttpHandlerFn, HttpInterceptorFn, HttpRequest, HttpResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { AppVersionService } from '@foundation/network/services';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

const VERSION_HEADER = 'X-App-Version';

/** Reads the backend's X-App-Version off every response and lets AppVersionService
 * reload the page when this cached bundle is behind a freshly deployed backend. */
export const AppVersionInterceptor: HttpInterceptorFn = (request: HttpRequest<unknown>, next: HttpHandlerFn): Observable<HttpEvent<unknown>> => {
	const appVersion = inject(AppVersionService);
	return next(request).pipe(
		tap((event) => {
			if (event instanceof HttpResponse) {
				appVersion.check(event.headers.get(VERSION_HEADER));
			}
		})
	);
};
