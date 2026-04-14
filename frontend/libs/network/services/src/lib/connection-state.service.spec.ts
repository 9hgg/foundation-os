import { TestBed } from '@angular/core/testing';
import { ConnectionStateService } from './connection-state.service';

describe('ConnectionStateService', () => {
  let service: ConnectionStateService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [ConnectionStateService],
    });
    service = TestBed.inject(ConnectionStateService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should have initial connected state from navigator.onLine', () => {
    expect(service.connected$$).toBeDefined();
    expect(service.connected$$.value).toBe(navigator.onLine);
  });

  it('connected() should return navigator.onLine', () => {
    expect(service.connected()).toBe(navigator.onLine);
  });

  it('should emit true when online event fires', () => {
    const spy = vi.fn();
    service.connected$$.subscribe(spy);

    window.dispatchEvent(new Event('online'));
    expect(spy).toHaveBeenCalledWith(true);
  });

  it('should emit false when offline event fires', () => {
    const spy = vi.fn();
    service.connected$$.subscribe(spy);

    window.dispatchEvent(new Event('offline'));
    expect(spy).toHaveBeenCalledWith(false);
  });
});
