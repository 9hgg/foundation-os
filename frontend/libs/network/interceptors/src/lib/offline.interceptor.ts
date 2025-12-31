import { NotificationService } from '@foundation/notification';
import { HttpEvent, HttpHandlerFn, HttpInterceptorFn, HttpRequest } from '@angular/common/http';
import { inject } from '@angular/core';
import { fromEvent, Observable, of } from 'rxjs';
import { delay, map, switchMap, take, takeUntil, tap } from 'rxjs/operators';

const onlineChanges$ = fromEvent(window, 'online').pipe(map(() => true));

export const OfflineInterceptor: HttpInterceptorFn = (request: HttpRequest<unknown>, next: HttpHandlerFn): Observable<HttpEvent<unknown>> => {
	const _notificationService = inject(NotificationService); // Assuming you have a notification service to handle offline notifications
	if (navigator.onLine) {
		return next(request);
	}

	// Wait until online event, then retry
	return onlineChanges$.pipe(
		takeUntil(
			of(null).pipe(
				delay(20000),
				tap(() => _notificationService.warning('Timeout after 20 seconds offline', 'Timeout', { dialogTarget: 'connection-state' })),
				take(1)
			)
		),
		switchMap(() => {
			console.log('Pushing request to retry after going online...');

			return next(request);
		})
	);
};
