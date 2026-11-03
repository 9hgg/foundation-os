import { HttpErrorResponse, HttpEvent, HttpHandlerFn, HttpInterceptorFn, HttpRequest } from '@angular/common/http';
import { defer, Observable, throwError, timer } from 'rxjs';
import { retry } from 'rxjs/operators';

/** Only idempotent methods — retrying a POST/PATCH/DELETE that actually reached the
 * server before the 502 (e.g. the response got dropped mid-deploy) could duplicate
 * side effects, unlike re-issuing a GET. */
const RETRYABLE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

const BASE_DELAY_MS = 500;
const MAX_TOTAL_DELAY_MS = 60_000;

/** Retries a 502 (Bad Gateway — typically a deploy restart briefly dropping the
 * backend) with exponential backoff: 500ms, 1s, 2s, 4s, ... capped so the total time
 * spent retrying a single request never exceeds one minute. */
export const BadGatewayRetryInterceptor: HttpInterceptorFn = (request: HttpRequest<unknown>, next: HttpHandlerFn): Observable<HttpEvent<unknown>> => {
	if (!RETRYABLE_METHODS.has(request.method)) {
		return next(request);
	}

	let elapsedDelayMs = 0;

	// defer() re-invokes next(request) on every (re)subscription, so each retry issues
	// a genuinely new request rather than replaying whatever the first call returned.
	return defer(() => next(request)).pipe(
		retry({
			delay: (error: unknown, retryCount: number) => {
				if (!(error instanceof HttpErrorResponse) || error.status !== 502) {
					return throwError(() => error);
				}

				const remainingBudgetMs = MAX_TOTAL_DELAY_MS - elapsedDelayMs;
				const delayMs = Math.min(BASE_DELAY_MS * 2 ** (retryCount - 1), remainingBudgetMs);
				if (delayMs <= 0) {
					return throwError(() => error);
				}

				elapsedDelayMs += delayMs;
				return timer(delayMs);
			},
		})
	);
};
