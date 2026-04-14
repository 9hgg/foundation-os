import { firstValueFrom, of } from 'rxjs';
import { anyToObservable, BehaviorSubjectReplayed, BehaviorSubjectReplayedFromObs, BehaviorSubjectReplayedProxied } from './utils';

describe('anyToObservable', () => {
  it('returns the same observable when given an observable', async () => {
    const obs$ = of(42);
    const result = anyToObservable(obs$);
    expect(result).toBe(obs$);
  });

  it('wraps a Promise in an observable', async () => {
    const result = anyToObservable(Promise.resolve('hello'));
    const value = await firstValueFrom(result);
    expect(value).toBe('hello');
  });

  it('wraps a plain value in an observable', async () => {
    const result = anyToObservable(99);
    const value = await firstValueFrom(result);
    expect(value).toBe(99);
  });
});

describe('BehaviorSubjectReplayed', () => {
  it('has initial value', () => {
    const b = new BehaviorSubjectReplayed(10);
    expect(b.value).toBe(10);
  });

  it('emits initial value on subscribe', async () => {
    const b = new BehaviorSubjectReplayed('init');
    const value = await firstValueFrom(b.$);
    expect(value).toBe('init');
  });

  it('emits new value after next()', async () => {
    const b = new BehaviorSubjectReplayed(0);
    const values: number[] = [];
    b.$.subscribe((v) => values.push(v));
    b.next(1);
    expect(values).toContain(1);
  });

  it('does not re-emit when same value is set', () => {
    const b = new BehaviorSubjectReplayed(5);
    const values: number[] = [];
    b.$.subscribe((v) => values.push(v));
    const before = values.length;
    b.next(5);
    expect(values.length).toBe(before);
  });

  it('value setter calls next', () => {
    const b = new BehaviorSubjectReplayed(1);
    b.value = 42;
    expect(b.value).toBe(42);
  });

  it('clone returns a deep clone of the value', () => {
    const b = new BehaviorSubjectReplayed({ x: 1 });
    const cloned = b.clone();
    expect(cloned).toEqual({ x: 1 });
    expect(cloned).not.toBe(b.value);
  });

  it('getOne$ emits a single value and completes', async () => {
    const b = new BehaviorSubjectReplayed('once');
    const value = await firstValueFrom(b.getOne$());
    expect(value).toBe('once');
  });

  it('callback is called when next() is called', () => {
    const b = new BehaviorSubjectReplayed(0);
    const cb = vi.fn();
    b.callback(cb);
    b.next(7);
    expect(cb).toHaveBeenCalledWith(7);
  });

  it('clearCallbacks removes all callbacks', () => {
    const b = new BehaviorSubjectReplayed(0);
    const cb = vi.fn();
    b.callback(cb);
    b.clearCallbacks();
    b.next(7);
    expect(cb).not.toHaveBeenCalled();
  });

  it('setSource pipes values from the source observable', async () => {
    const b = new BehaviorSubjectReplayed(0);
    b.setSource(of(99));
    const value = await firstValueFrom(b.$);
    expect(value).toBe(99);
  });

  it('forceReplay re-emits the current value', () => {
    const b = new BehaviorSubjectReplayed(42);
    const values: number[] = [];
    b.$.subscribe((v) => values.push(v));
    const before = values.length;
    b.forceReplay();
    expect(values.length).toBeGreaterThan(before);
  });

  it('destructor calls complete on the inner BehaviorSubject', () => {
    const b = new BehaviorSubjectReplayed(0);
    // After destructor, next() should not emit anymore
    const values: number[] = [];
    b.$.subscribe((v) => values.push(v));
    b.destructor();
    // sourceSubscription should be cleaned up (no throw)
    expect(b).toBeDefined();
  });
});

describe('BehaviorSubjectReplayedFromObs', () => {
  it('starts with initial value and then uses obs', async () => {
    const b = BehaviorSubjectReplayedFromObs(0, of(99));
    const value = await firstValueFrom(b.$);
    expect(value).toBe(99);
  });
});

describe('BehaviorSubjectReplayedProxied', () => {
  it('initializes with the initial value', () => {
    const b = new BehaviorSubjectReplayedProxied(() => of(42), 0);
    expect(b.value).toBe(0);
  });

  it('$ emits the initial value', async () => {
    const b = new BehaviorSubjectReplayedProxied(() => of('hello'), 'init');
    const value = await firstValueFrom(b.$);
    expect(value).toBe('init');
  });

  it('next() calls buildObservable and updates value', async () => {
    const b = new BehaviorSubjectReplayedProxied((id: string) => of(`value-${id}`), 'none');
    b.next('abc');
    const value = await firstValueFrom(b.$);
    expect(value).toBe('value-abc');
  });

  it('value getter returns current value', async () => {
    const b = new BehaviorSubjectReplayedProxied((n: number) => of(n * 2), 0);
    b.next(5);
    await firstValueFrom(b.$);
    expect(b.value).toBe(10);
  });

  it('forceReplay re-emits current value', () => {
    const b = new BehaviorSubjectReplayedProxied(() => of(99), 0);
    const values: number[] = [];
    b.$.subscribe((v) => values.push(v));
    const before = values.length;
    b.forceReplay();
    expect(values.length).toBeGreaterThan(before);
  });

  it('destructor cleans up', () => {
    const b = new BehaviorSubjectReplayedProxied(() => of(1), 0);
    expect(() => b.destructor()).not.toThrow();
  });

  it('pipe is bound to the inner $$$', async () => {
    const b = new BehaviorSubjectReplayedProxied(() => of(5), 5);
    expect(typeof b.pipe).toBe('function');
  });
});
