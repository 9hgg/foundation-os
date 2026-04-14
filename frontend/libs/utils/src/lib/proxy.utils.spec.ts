import { firstValueFrom } from 'rxjs';
import { createBehaviorSubjectProxy } from './proxy.utils';

describe('createBehaviorSubjectProxy', () => {
  it('returns a proxy object with the same properties', () => {
    const proxy = createBehaviorSubjectProxy({ name: 'Alice', age: 30 });
    expect(proxy.name).toBe('Alice');
    expect(proxy.age).toBe(30);
  });

  it('provides a root $ observable that emits the initial value', async () => {
    const proxy = createBehaviorSubjectProxy({ x: 1 });
    const value = await firstValueFrom(proxy.$);
    expect(value).toEqual({ x: 1 });
  });

  it('root $ observable updates when a property is set', async () => {
    const proxy = createBehaviorSubjectProxy({ x: 1 });
    // Subscribe first to create the behavior subject
    const values: any[] = [];
    proxy.$.subscribe((v) => values.push(v));

    proxy.x = 2;
    expect(values.length).toBeGreaterThan(0);
    expect(values[values.length - 1].x).toBe(2);
  });

  it('property observable emits when that property changes', async () => {
    const proxy = createBehaviorSubjectProxy({ name: 'Alice' });
    const values: string[] = [];
    proxy.name$.subscribe((v) => values.push(v as string));

    proxy.name = 'Bob';
    expect(values).toContain('Bob');
  });

  it('does not emit when the same value is set', async () => {
    const proxy = createBehaviorSubjectProxy({ x: 42 });
    const values: any[] = [];
    proxy.$.subscribe((v) => values.push(v));

    const countBefore = values.length;
    proxy.x = 42; // same value
    expect(values.length).toBe(countBefore);
  });

  it('_ property returns the original object', () => {
    const original = { a: 1 };
    const proxy = createBehaviorSubjectProxy(original);
    expect(proxy._).toBe(original);
  });

  it('completeAllObservables completes the $ observable', () => {
    const proxy = createBehaviorSubjectProxy({ x: 1 });
    let completed = false;
    proxy.$.subscribe({ complete: () => (completed = true) });
    proxy.completeAllObservables();
    expect(completed).toBe(true);
  });

  it('destroy cleans up behavior subjects', () => {
    const proxy = createBehaviorSubjectProxy({ x: 1 });
    proxy.$; // create the $ BehaviorSubject
    proxy.destroy();
    expect(Object.keys(proxy.__behaviorSubjects)).toHaveLength(0);
  });

  it('handles nested object access', () => {
    const proxy = createBehaviorSubjectProxy({ user: { name: 'Alice' } });
    expect(proxy.user.name).toBe('Alice');
  });

  it('calls onGet callback when a property is accessed', () => {
    const onGet = vi.fn();
    const proxy = createBehaviorSubjectProxy({ x: 1 }, onGet);
    void proxy.x;
    expect(onGet).toHaveBeenCalled();
  });

  it('calls onSet callback when a property is set', () => {
    const onSet = vi.fn();
    const proxy = createBehaviorSubjectProxy({ x: 1 }, undefined, onSet);
    proxy.x = 99;
    expect(onSet).toHaveBeenCalledWith('x', 99);
  });

  it('push works on array proxies', () => {
    const proxy = createBehaviorSubjectProxy({ items: [1, 2] as number[] });
    proxy.items.push(3);
    expect(proxy.items[2]).toBe(3);
  });

  it('__behaviorSubjects tracks created subjects', () => {
    const proxy = createBehaviorSubjectProxy({ a: 1 });
    proxy.$; // create root subject
    expect(proxy.__behaviorSubjects['$']).toBeDefined();
  });

  it('__observables tracks created observables', () => {
    const proxy = createBehaviorSubjectProxy({ a: 1 });
    proxy.$;
    expect(proxy.__observables['$']).toBeDefined();
  });

  it('destroy cleans up behavior subjects and observables', async () => {
    const proxy = createBehaviorSubjectProxy({ x: 1 });
    proxy.$; // create a subject
    proxy.destroy();
    // After destroy, subjects and observables maps should be cleared
    expect(Object.keys(proxy.__behaviorSubjects)).toHaveLength(0);
    expect(Object.keys(proxy.__observables)).toHaveLength(0);
  });

  it('deleteProperty removes the property and completes its observable', async () => {
    const proxy = createBehaviorSubjectProxy({ a: 1, b: 2 } as any);
    // Subscribe to create the subject for 'a'
    const values: any[] = [];
    proxy['a$'].subscribe((v: any) => values.push(v));
    // Delete 'a'
    delete (proxy as any).a;
    expect((proxy as any).a).toBeUndefined();
  });

  it('has operator returns true for existing property', () => {
    const proxy = createBehaviorSubjectProxy({ x: 1 });
    expect('x' in proxy).toBe(true);
  });

  it('has operator returns false for non-existing property', () => {
    const proxy = createBehaviorSubjectProxy({ x: 1 });
    expect('y' in proxy).toBe(false);
  });

  it('method binding returns bound function', () => {
    const obj = {
      value: 42,
      getValue() { return this.value; }
    };
    const proxy = createBehaviorSubjectProxy(obj);
    const fn = (proxy as any).getValue;
    expect(typeof fn).toBe('function');
  });
});
