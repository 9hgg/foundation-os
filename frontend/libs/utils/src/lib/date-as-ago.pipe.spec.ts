import { DateAsAgoPipe } from './date-as-ago.pipe';

describe('DateAsAgoPipe', () => {
  let pipe: DateAsAgoPipe;
  const now = new Date('2025-01-01T12:00:00.000Z').getTime();

  beforeEach(() => {
    pipe = new DateAsAgoPipe();
    vi.useFakeTimers();
    vi.setSystemTime(now);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns empty string for undefined', () => {
    expect(pipe.transform(undefined)).toBe('');
  });

  it('returns empty string for falsy number', () => {
    expect(pipe.transform(0)).toBe('');
  });

  it('handles future dates by clamping delta to 0', () => {
    const future = now + 5000;
    expect(pipe.transform(future)).toMatch(/seconds ago/);
  });

  it('shows "1 second ago" for 1s ago', () => {
    expect(pipe.transform(now - 1000)).toBe('1 second ago');
  });

  it('shows "N seconds ago" for < 60s', () => {
    expect(pipe.transform(now - 30000)).toBe('30 seconds ago');
  });

  it('shows "1 minute N seconds ago" for < 3600s', () => {
    expect(pipe.transform(now - 90000)).toBe('1 minute 30 seconds ago');
  });

  it('shows "N minutes ago" without seconds when exact', () => {
    expect(pipe.transform(now - 2 * 60 * 1000)).toBe('2 minutes ago');
  });

  it('shows "1 hour ago" for 3600s', () => {
    expect(pipe.transform(now - 3600 * 1000)).toBe('1 hour ago');
  });

  it('shows "N hours M minutes ago" for < 1 day', () => {
    expect(pipe.transform(now - (2 * 3600 + 30 * 60) * 1000)).toBe('2 hours 30 minutes ago');
  });

  it('shows "1 day N hours ago" for < 2 days', () => {
    expect(pipe.transform(now - (25 * 3600) * 1000)).toBe('1 day 1 hour ago');
  });

  it('shows a locale date string for >= 2 days', () => {
    const old = now - 3 * 86400 * 1000;
    const result = pipe.transform(old) as string;
    // Should be a locale string, not a "ago" pattern
    expect(result).not.toMatch(/seconds ago|minutes ago|hours ago/);
  });

  it('accepts a Date object', () => {
    const d = new Date(now - 5000);
    expect(pipe.transform(d)).toBe('5 seconds ago');
  });

  it('accepts an ISO string', () => {
    const d = new Date(now - 5000).toISOString();
    expect(pipe.transform(d)).toBe('5 seconds ago');
  });
});
