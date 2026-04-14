import { TestBed } from '@angular/core/testing';
import { CookiesService } from './cookies.service';

describe('CookiesService', () => {
  let service: CookiesService;

  beforeEach(() => {
    vi.useFakeTimers();
    TestBed.configureTestingModule({
      providers: [CookiesService],
    });
    service = TestBed.inject(CookiesService);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllTimers();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('setCookie then getCookie returns the value', () => {
    service.setCookie('test_key', 'test_val', 1);
    expect(service.getCookie('test_key')).toBe('test_val');
  });

  it('getCookie returns undefined for unknown key', () => {
    expect(service.getCookie('nonexistent_cookie_xyz')).toBeUndefined();
  });

  it('deleteCookie removes the cookie', () => {
    service.setCookie('to_delete', 'value', 1);
    service.deleteCookie('to_delete');
    // After deletion the cookie should be expired; in jsdom the value may be gone
    const val = service.getCookie('to_delete');
    expect(val === undefined || val === '').toBe(true);
  });

  it('getAllCookies returns an object with cookie keys', () => {
    service.setCookie('alltest', 'abc', 1);
    const all = service.getAllCookies();
    expect(typeof all).toBe('object');
    expect(all['alltest']).toBeDefined();
    expect(all['alltest'].rawValue).toBe('abc');
  });

  it('detectCookieClearing calls cookiePresentCallback when cookie exists', () => {
    service.setCookie('k', 'v', 1);
    const presentCb = vi.fn();
    const clearedCb = vi.fn();
    service.detectCookieClearing(presentCb, clearedCb);
    expect(presentCb).toHaveBeenCalled();
    expect(clearedCb).not.toHaveBeenCalled();
  });
});
