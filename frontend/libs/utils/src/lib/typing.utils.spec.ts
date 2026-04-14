import { coerceArray, isFunction, isUndefined, isString, capitalize, isObject, isValidJSON, deepFreeze } from './typing.utils';

describe('coerceArray', () => {
  it('wraps a scalar in an array', () => {
    expect(coerceArray(1)).toEqual([1]);
  });

  it('returns an array as-is', () => {
    const arr = [1, 2, 3];
    expect(coerceArray(arr)).toBe(arr);
  });

  it('wraps null', () => {
    expect(coerceArray(null)).toEqual([null]);
  });
});

describe('isFunction', () => {
  it('returns true for a function', () => {
    expect(isFunction(() => {})).toBe(true);
  });

  it('returns false for non-function', () => {
    expect(isFunction(42)).toBe(false);
    expect(isFunction('str')).toBe(false);
    expect(isFunction(null)).toBe(false);
  });
});

describe('isUndefined', () => {
  it('returns true for undefined', () => {
    expect(isUndefined(undefined)).toBe(true);
  });

  it('returns false for null', () => {
    expect(isUndefined(null)).toBe(false);
  });

  it('returns false for 0', () => {
    expect(isUndefined(0)).toBe(false);
  });
});

describe('isString', () => {
  it('returns true for a string', () => {
    expect(isString('hello')).toBe(true);
  });

  it('returns false for number', () => {
    expect(isString(1)).toBe(false);
  });

  it('returns false for null', () => {
    expect(isString(null)).toBe(false);
  });
});

describe('capitalize', () => {
  it('capitalizes first letter', () => {
    expect(capitalize('hello')).toBe('Hello');
  });

  it('leaves already-capitalized string unchanged', () => {
    expect(capitalize('World')).toBe('World');
  });

  it('handles single char', () => {
    expect(capitalize('a')).toBe('A');
  });

  it('handles empty string', () => {
    expect(capitalize('')).toBe('');
  });
});

describe('isObject', () => {
  it('returns true for plain object', () => {
    expect(isObject({})).toBe(true);
    expect(isObject({ a: 1 })).toBe(true);
  });

  it('returns false for array', () => {
    expect(isObject([])).toBe(false);
  });

  it('returns false for null', () => {
    expect(isObject(null)).toBe(false);
  });

  it('returns false for primitives', () => {
    expect(isObject(1)).toBe(false);
    expect(isObject('str')).toBe(false);
  });
});

describe('isValidJSON', () => {
  it('returns true for valid JSON string', () => {
    expect(isValidJSON('{"a":1}')).toBe(true);
    expect(isValidJSON('"hello"')).toBe(true);
    expect(isValidJSON('42')).toBe(true);
    expect(isValidJSON('null')).toBe(true);
  });

  it('returns false for invalid JSON', () => {
    expect(isValidJSON('{bad json')).toBe(false);
    expect(isValidJSON(undefined)).toBe(false);
  });
});

describe('deepFreeze', () => {
  it('freezes an object', () => {
    const obj = deepFreeze({ a: 1 });
    expect(Object.isFrozen(obj)).toBe(true);
  });

  it('freezes nested objects', () => {
    const obj = deepFreeze({ a: { b: 2 } });
    expect(Object.isFrozen(obj.a)).toBe(true);
  });

  it('returns the same reference', () => {
    const obj = { x: 1 };
    expect(deepFreeze(obj)).toBe(obj);
  });
});
