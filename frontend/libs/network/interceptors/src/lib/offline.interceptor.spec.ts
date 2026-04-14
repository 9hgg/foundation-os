import { TestBed } from '@angular/core/testing';
import { HttpRequest, HttpHandlerFn, HttpResponse } from '@angular/common/http';
import { of, firstValueFrom } from 'rxjs';
import { NotificationService } from '@foundation/notification';
import { OfflineInterceptor } from './offline.interceptor';

function makeHandler(response: any = new HttpResponse({ status: 200 })): HttpHandlerFn {
  return vi.fn().mockReturnValue(of(response));
}

describe('OfflineInterceptor', () => {
  let notificationMock: { warning: ReturnType<typeof vi.fn>; snack: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    notificationMock = { warning: vi.fn(), snack: vi.fn() };
    TestBed.configureTestingModule({
      providers: [{ provide: NotificationService, useValue: notificationMock }],
    });
  });

  it('passes through when navigator.onLine is true', async () => {
    Object.defineProperty(navigator, 'onLine', { value: true, writable: true, configurable: true });

    const req = new HttpRequest('GET', '/api/test');
    const handler = makeHandler();

    const result = await TestBed.runInInjectionContext(() =>
      firstValueFrom(OfflineInterceptor(req, handler))
    );

    expect(handler).toHaveBeenCalledWith(req);
    expect(result).toBeInstanceOf(HttpResponse);
  });
});
