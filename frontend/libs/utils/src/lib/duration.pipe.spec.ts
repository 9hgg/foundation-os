import { toHoursMinutesSeconds, DurationPipe } from './duration.pipe';

describe('toHoursMinutesSeconds', () => {
  it('formats seconds only (< 60)', () => {
    expect(toHoursMinutesSeconds(45, [])).toBe('0:45');
  });

  it('formats minutes and seconds (< 3600)', () => {
    expect(toHoursMinutesSeconds(90, [])).toBe('1:30');
  });

  it('formats hours, minutes, seconds (>= 3600)', () => {
    expect(toHoursMinutesSeconds(3661, [])).toBe('1:01:01');
  });

  it('formats with showUnits for seconds only', () => {
    expect(toHoursMinutesSeconds(75, ['showUnits'])).toBe('1mn15s');
  });

  it('formats with showUnits for hours', () => {
    expect(toHoursMinutesSeconds(3661, ['showUnits'])).toBe('1h01mn01s');
  });

  it('formats showUnits with exact hours (no minutes/seconds)', () => {
    expect(toHoursMinutesSeconds(7200, ['showUnits'])).toBe('2h');
  });

  it('pads seconds with zero', () => {
    expect(toHoursMinutesSeconds(65, [])).toBe('1:05');
  });
});

describe('DurationPipe', () => {
  let pipe: DurationPipe;

  beforeEach(() => {
    pipe = new DurationPipe();
  });

  it('delegates to toHoursMinutesSeconds', () => {
    expect(pipe.transform(90)).toBe('1:30');
  });

  it('passes showUnits arg', () => {
    expect(pipe.transform(3600, 'showUnits')).toBe('1h');
  });
});
