import { parseAStringOverADict } from './parser.class';

const ctx = {
  key: { To: { Use: 'name' } },
  a: { b: { c: 3 } },
  d: [1, 2, 'xyz'],
  e: 'hello',
  f: [{ g: 'world' }],
  source: [
    { id: 0, name: 'Item 1' },
    { id: 1, name: 'Item 2' },
    { id: 2, name: 'Item 3' },
  ],
  targetId: 2,
};

describe('parseAStringOverADict', () => {
  it('evaluates a simple string literal', () => {
    expect(parseAStringOverADict('"hello"', ctx)).toBe('hello');
  });

  it('evaluates a number literal', () => {
    expect(parseAStringOverADict('42', ctx)).toBe(42);
  });

  it('accesses a top-level key', () => {
    expect(parseAStringOverADict('e', ctx)).toBe('hello');
  });

  it('accesses nested key via dot notation', () => {
    expect(parseAStringOverADict('a.b.c', ctx)).toBe(3);
  });

  it('returns undefined for missing nested key', () => {
    expect(parseAStringOverADict('a.b.c.d', ctx)).toBeUndefined();
  });

  it('accesses array index', () => {
    expect(parseAStringOverADict('d[2]', ctx)).toBe('xyz');
  });

  it('evaluates addition', () => {
    expect(parseAStringOverADict('1+2', ctx)).toBe(3);
  });

  it('evaluates subtraction', () => {
    expect(parseAStringOverADict('5-3', ctx)).toBe(2);
  });

  it('evaluates multiplication', () => {
    expect(parseAStringOverADict('3*4', ctx)).toBe(12);
  });

  it('evaluates division', () => {
    expect(parseAStringOverADict('10/2', ctx)).toBe(5);
  });

  it('evaluates modulo', () => {
    expect(parseAStringOverADict('10%7', ctx)).toBe(3);
  });

  it('respects operator precedence with parentheses', () => {
    expect(parseAStringOverADict('(1+2)*3', ctx)).toBe(9);
  });

  it('concatenates strings', () => {
    expect(parseAStringOverADict('"aaaa"+"bbbb"', ctx)).toBe('aaaabbbb');
  });

  it('builds an object literal', () => {
    expect(parseAStringOverADict('{"a":2}', ctx)).toEqual({ a: 2 });
  });

  it('builds a nested object from context', () => {
    const result = parseAStringOverADict('{"sum": 2*(a.b.c)}', ctx);
    expect(result).toEqual({ sum: 6 });
  });

  it('returns a tuple of two values', () => {
    expect(parseAStringOverADict('"aaaa","bbbb"', ctx)).toEqual(['aaaa', 'bbbb']);
  });

  it('returns empty array for []', () => {
    expect(parseAStringOverADict('[]', ctx)).toEqual([]);
  });

  it('filters an array with <filter>', () => {
    const result = parseAStringOverADict('source<"name":"Item 3">', ctx);
    expect(result).toEqual([{ id: 2, name: 'Item 3' }]);
  });

  it('uses @ operator to change context', () => {
    const result = parseAStringOverADict('{"value":b@a}', { a: { b: { c: 3 } }, b: 'unused' });
    expect(result).toEqual({ value: { c: 3 } });
  });

  it('resolves dynamic key access via indirect reference', () => {
    expect(parseAStringOverADict('d[source[1]."id"]', ctx)).toBe(2);
  });

  it('evaluates a property on a list element', () => {
    expect(parseAStringOverADict('(source[1])."name"', ctx)).toBe('Item 2');
  });

  it('evaluates deep dot access combined with array indexing', () => {
    expect(parseAStringOverADict('{d[2]:source[1].key.To.Use}', ctx)).toEqual({ xyz: 'Item 2' });
  });

  it('handles number immediately followed by key (returns array)', () => {
    expect(parseAStringOverADict('123a.b.c', ctx)).toEqual([123, 3]);
  });

  it('generates a uuid for $uuid special token', () => {
    const result = parseAStringOverADict('$uuid', ctx);
    expect(typeof result).toBe('string');
    expect(result).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  });

  it('throws on unknown special token', () => {
    expect(() => parseAStringOverADict('$unknown', ctx)).toThrow();
  });

  it('throws on invalid character', () => {
    expect(() => parseAStringOverADict('?invalid', ctx)).toThrow();
  });

  it('throws when filtering non-array', () => {
    expect(() => parseAStringOverADict('e<"x":"y">', ctx)).toThrow();
  });

  it('handles deeply nested groups', () => {
    const result = parseAStringOverADict('(((("aaaa","bbbb"),("cccc","dddd"))))', ctx);
    expect(result).toEqual([['aaaa', 'bbbb'], ['cccc', 'dddd']]);
  });
});
