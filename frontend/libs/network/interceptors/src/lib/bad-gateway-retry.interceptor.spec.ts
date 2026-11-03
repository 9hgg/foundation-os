import { HttpErrorResponse, HttpHandlerFn, HttpRequest, HttpResponse } from '@angular/common/http';
import { firstValueFrom, of, throwError } from 'rxjs';
import { BadGatewayRetryInterceptor } from './bad-gateway-retry.interceptor';

describe('BadGatewayRetryInterceptor', () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('passes through a successful request untouched', async () => {
		const req = new HttpRequest('GET', '/api/test');
		const response = new HttpResponse({ status: 200 });
		const handler: HttpHandlerFn = vi.fn().mockReturnValue(of(response));

		const result = await firstValueFrom(BadGatewayRetryInterceptor(req, handler));

		expect(handler).toHaveBeenCalledTimes(1);
		expect(result).toBe(response);
	});

	it('does not retry non-idempotent methods', async () => {
		const req = new HttpRequest('POST', '/api/test', {});
		const error = new HttpErrorResponse({ status: 502 });
		const handler: HttpHandlerFn = vi.fn().mockReturnValue(throwError(() => error));

		await expect(firstValueFrom(BadGatewayRetryInterceptor(req, handler))).rejects.toBe(error);
		expect(handler).toHaveBeenCalledTimes(1);
	});

	it('does not retry non-502 errors', async () => {
		const req = new HttpRequest('GET', '/api/test');
		const error = new HttpErrorResponse({ status: 500 });
		const handler: HttpHandlerFn = vi.fn().mockReturnValue(throwError(() => error));

		await expect(firstValueFrom(BadGatewayRetryInterceptor(req, handler))).rejects.toBe(error);
		expect(handler).toHaveBeenCalledTimes(1);
	});

	it('retries a 502 on a GET with exponential backoff, then succeeds', async () => {
		const req = new HttpRequest('GET', '/api/test');
		const error = new HttpErrorResponse({ status: 502 });
		const response = new HttpResponse({ status: 200 });
		const handler: HttpHandlerFn = vi
			.fn()
			.mockReturnValueOnce(throwError(() => error))
			.mockReturnValueOnce(throwError(() => error))
			.mockReturnValueOnce(of(response));

		const resultPromise = firstValueFrom(BadGatewayRetryInterceptor(req, handler));

		expect(handler).toHaveBeenCalledTimes(1);

		// Two retries: 500ms then 1000ms of backoff before the third call succeeds.
		await vi.advanceTimersByTimeAsync(2000);

		expect(await resultPromise).toBe(response);
		expect(handler).toHaveBeenCalledTimes(3);
	});

	it('stops retrying once the one-minute budget is exhausted', async () => {
		const req = new HttpRequest('GET', '/api/test');
		const error = new HttpErrorResponse({ status: 502 });
		const handler: HttpHandlerFn = vi.fn().mockReturnValue(throwError(() => error));

		const resultPromise = firstValueFrom(BadGatewayRetryInterceptor(req, handler)).catch((caught) => caught);

		// Drain far more than 60s of backoff — delays are 500ms, 1s, 2s, 4s, ...,
		// clamped to the remaining budget, so this must terminate well before 5min.
		await vi.advanceTimersByTimeAsync(5 * 60_000);

		expect(await resultPromise).toBe(error);
	});
});
