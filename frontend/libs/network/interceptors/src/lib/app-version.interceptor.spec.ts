import { HttpErrorResponse, HttpHandlerFn, HttpHeaders, HttpRequest, HttpResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { AppVersionService } from '@foundation/network/services';
import { lastValueFrom, of, throwError } from 'rxjs';
import { AppVersionInterceptor } from './app-version.interceptor';

describe('AppVersionInterceptor', () => {
	let appVersionService: { check: ReturnType<typeof vi.fn> };

	beforeEach(() => {
		appVersionService = { check: vi.fn() };
		TestBed.configureTestingModule({
			providers: [{ provide: AppVersionService, useValue: appVersionService }],
		});
	});

	const run = (request: HttpRequest<unknown>, handler: HttpHandlerFn) => TestBed.runInInjectionContext(() => lastValueFrom(AppVersionInterceptor(request, handler)));

	it('checks the version header off a successful response', async () => {
		const req = new HttpRequest('GET', '/api/test');
		const response = new HttpResponse({ status: 200, headers: new HttpHeaders({ 'X-App-Version': 'v2' }) });
		const handler: HttpHandlerFn = vi.fn().mockReturnValue(of(response));

		const result = await run(req, handler);

		expect(result).toBe(response);
		expect(appVersionService.check).toHaveBeenCalledWith('v2');
	});

	it('checks with null when the header is absent', async () => {
		const req = new HttpRequest('GET', '/api/test');
		const response = new HttpResponse({ status: 200 });
		const handler: HttpHandlerFn = vi.fn().mockReturnValue(of(response));

		await run(req, handler);

		expect(appVersionService.check).toHaveBeenCalledWith(null);
	});

	it('ignores non-HttpResponse events (e.g. upload progress) without checking the version', async () => {
		const req = new HttpRequest('GET', '/api/test');
		const progressEvent = { type: 1 };
		const response = new HttpResponse({ status: 200, headers: new HttpHeaders({ 'X-App-Version': 'v2' }) });
		const handler: HttpHandlerFn = vi.fn().mockReturnValue(of(progressEvent, response));

		await run(req, handler);

		expect(appVersionService.check).toHaveBeenCalledTimes(1);
		expect(appVersionService.check).toHaveBeenCalledWith('v2');
	});

	it('propagates an error without calling check', async () => {
		const req = new HttpRequest('GET', '/api/test');
		const error = new HttpErrorResponse({ status: 500 });
		const handler: HttpHandlerFn = vi.fn().mockReturnValue(throwError(() => error));

		await expect(run(req, handler)).rejects.toBe(error);
		expect(appVersionService.check).not.toHaveBeenCalled();
	});
});
