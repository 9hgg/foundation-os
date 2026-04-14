import { of } from 'rxjs';
import { findObservables, reconstructObject } from './flatten-observables.utils';

describe('findObservables', () => {
  it('returns empty maps for a plain object with no observables', () => {
    const { observables, nonObservableValues } = findObservables({ a: 1, b: 'hello' });
    expect(Object.keys(observables)).toHaveLength(0);
    expect(nonObservableValues).toEqual({ a: 1, b: 'hello' });
  });

  it('extracts top-level observable into observables map', () => {
    const obs$ = of(42);
    const { observables, nonObservableValues } = findObservables({ a: obs$, b: 'static' });
    expect(observables['a']).toBe(obs$);
    expect(nonObservableValues['b']).toBe('static');
  });

  it('extracts nested observable with dot-path key', () => {
    const obs$ = of('nested');
    const { observables } = findObservables({ parent: { child: obs$ } });
    expect(observables['parent.child']).toBe(obs$);
  });

  it('handles array of observables', () => {
    const obs1$ = of(1);
    const obs2$ = of(2);
    const { observables } = findObservables({ arr: [obs1$, obs2$] });
    expect(observables['arr[0]']).toBe(obs1$);
    expect(observables['arr[1]']).toBe(obs2$);
  });

  it('handles object where all values are plain (no observables)', () => {
    const { observables, nonObservableValues } = findObservables({ x: 10, y: 20 });
    expect(Object.keys(observables)).toHaveLength(0);
    expect(nonObservableValues['x']).toBe(10);
    expect(nonObservableValues['y']).toBe(20);
  });
});

describe('reconstructObject', () => {
  it('reconstructs from observable values and non-observable values', () => {
    const obs$ = of(99);
    const { observables, nonObservableValues } = findObservables({ a: obs$, b: 'static' });

    // Simulate combined values (resolved from combineLatest, index-based)
    const combinedValues: Record<string, any> = { 0: 99 };
    const result = reconstructObject(observables, combinedValues, nonObservableValues);

    expect(result['a']).toBe(99);
    expect(result['b']).toBe('static');
  });

  it('reconstructs nested paths correctly', () => {
    const obs$ = of('deep');
    const { observables, nonObservableValues } = findObservables({ parent: { obs: obs$, plain: 'val' } });
    const combinedValues: Record<string, any> = { 0: 'deep' };
    const result = reconstructObject(observables, combinedValues, nonObservableValues);

    expect(result['parent']['obs']).toBe('deep');
    expect(result['parent']['plain']).toBe('val');
  });
});
