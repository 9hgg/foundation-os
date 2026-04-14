import { OctetHumanReadablePipe } from './octet-humand-readable.pipe';

describe('OctetHumanReadablePipe', () => {
  let pipe: OctetHumanReadablePipe;

  beforeEach(() => {
    pipe = new OctetHumanReadablePipe();
  });

  it('returns "0 octets" for 0', () => {
    expect(pipe.transform(0)).toBe('0 octets');
  });

  it('formats bytes (octets)', () => {
    expect(pipe.transform(500)).toBe('500 octets');
  });

  it('formats kilobytes (ko)', () => {
    expect(pipe.transform(1024)).toBe('1 ko');
  });

  it('formats megabytes (Mo)', () => {
    expect(pipe.transform(1024 * 1024)).toBe('1 Mo');
  });

  it('formats gigabytes (Go)', () => {
    expect(pipe.transform(1024 * 1024 * 1024)).toBe('1 Go');
  });

  it('formats with decimal precision', () => {
    expect(pipe.transform(1536)).toBe('1.5 ko');
  });
});
