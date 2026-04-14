import { isEqual } from './equal.utils';

describe('isEqual', () => {
  it('same primitive values', () => {
    expect(isEqual(1, 1)).toBe(true);
    expect(isEqual('a', 'a')).toBe(true);
    expect(isEqual(true, false)).toBe(false);
  });

  it('null and undefined', () => {
    expect(isEqual(null, null)).toBe(true);
    expect(isEqual(undefined, undefined)).toBe(true);
    expect(isEqual(null, undefined)).toBe(false);
  });

  it('NaN equals NaN', () => {
    expect(isEqual(NaN, NaN)).toBe(true);
    expect(isEqual(NaN, 1)).toBe(false);
  });

  it('same-reference object', () => {
    const o = { a: 1 };
    expect(isEqual(o, o)).toBe(true);
  });

  it('shallow equal objects', () => {
    expect(isEqual({ a: 1, b: 2 }, { a: 1, b: 2 })).toBe(true);
  });

  it('different keys count', () => {
    expect(isEqual({ a: 1 }, { a: 1, b: 2 })).toBe(false);
  });

  it('different values', () => {
    expect(isEqual({ a: 1 }, { a: 2 })).toBe(false);
  });

  it('nested objects', () => {
    expect(isEqual({ a: { b: 1 } }, { a: { b: 1 } })).toBe(true);
    expect(isEqual({ a: { b: 1 } }, { a: { b: 2 } })).toBe(false);
  });

  it('arrays equal', () => {
    expect(isEqual([1, 2, 3], [1, 2, 3])).toBe(true);
  });

  it('arrays different length', () => {
    expect(isEqual([1, 2], [1, 2, 3])).toBe(false);
  });

  it('arrays different values', () => {
    expect(isEqual([1, 2, 3], [1, 2, 4])).toBe(false);
  });

  it('Maps equal', () => {
    const a = new Map([['k', 1]]);
    const b = new Map([['k', 1]]);
    expect(isEqual(a, b)).toBe(true);
  });

  it('Maps different size', () => {
    const a = new Map([['k', 1]]);
    const b = new Map([['k', 1], ['j', 2]]);
    expect(isEqual(a, b)).toBe(false);
  });

  it('Maps different values', () => {
    const a = new Map([['k', 1]]);
    const b = new Map([['k', 2]]);
    expect(isEqual(a, b)).toBe(false);
  });

  it('Sets equal', () => {
    const a = new Set([1, 2, 3]);
    const b = new Set([1, 2, 3]);
    expect(isEqual(a, b)).toBe(true);
  });

  it('Sets different size', () => {
    const a = new Set([1, 2]);
    const b = new Set([1, 2, 3]);
    expect(isEqual(a, b)).toBe(false);
  });

  it('RegExp equal', () => {
    expect(isEqual(/abc/gi, /abc/gi)).toBe(true);
  });

  it('RegExp different flags', () => {
    expect(isEqual(/abc/g, /abc/i)).toBe(false);
  });

  it('RegExp different source', () => {
    expect(isEqual(/abc/, /xyz/)).toBe(false);
  });

  it('different constructors', () => {
    expect(isEqual([], {})).toBe(false);
  });
});
