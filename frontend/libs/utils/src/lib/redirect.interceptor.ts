import { HttpEvent, HttpHandlerFn, HttpInterceptorFn, HttpRequest } from '@angular/common/http';
import { Observable, catchError, throwError } from 'rxjs';

export const RedirectInterceptor: HttpInterceptorFn = (request: HttpRequest<unknown>, next: HttpHandlerFn): Observable<HttpEvent<unknown>> => {
	// if there is a 301, 302, 303, 307, 308 redirect, we want to follow it (whate)
	// https://developer.mozilla.org/en-US/docs/Web/HTTP/Redirections

	// we must catch the error first
	return next(request).pipe(
		catchError((err) => {
			if (err.status === 308) {
				console.log('RedirectInterceptor: 308');

				// Extract the URL from the Location header
				const locationUrl = err.headers.get('Location');
				// Clone the original request to the new location URL
				const redirectReq = request.clone({ url: locationUrl });
				// Relaunch the request to the new location
				return next(redirectReq);
			}
			// If it's not a redirect, or some other error occurs, rethrow the error.
			return throwError(err);
		})
	);
};
