import { HttpEvent, HttpHandlerFn, HttpInterceptorFn, HttpRequest, HttpResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { Observable, of } from 'rxjs';
import { tap } from 'rxjs/operators';
import { CacheService } from './cache.service';

export const InterceptorSkipCacheHeader = 'X-Skip-Cache-Interceptor';
const DEBUG = false; // Set to true to enable debug logging

export const CacheInterceptor: HttpInterceptorFn = (request: HttpRequest<unknown>, next: HttpHandlerFn): Observable<HttpEvent<unknown>> => {
	if (request.headers.has(InterceptorSkipCacheHeader)) {
		const headers = request.headers.delete(InterceptorSkipCacheHeader);
		return next(request.clone({ headers }));
	}

	const cacheService = inject(CacheService);

	const cacheHeader = request.headers.get('toCache');
	if (!cacheHeader) {
		return next(request);
	}
	if (DEBUG) console.log('CacheInterceptor called with cacheHeader:', cacheHeader);

	const cachedResponse = cacheService.get(request.url);
	if (cachedResponse) {
		if (DEBUG) console.log('Cache hit for key:', request.url, { cachedResponse });
		return of(new HttpResponse({ body: cachedResponse }));
	}

	if (DEBUG) console.log('Cache miss for key:', request.url);

	const duration = parseInt(cacheHeader, 10);
	return next(request).pipe(
		tap((event) => {
			if (event instanceof HttpResponse) {
				cacheService.set(request.url, event.body, duration);
			}
		})
	);
};
