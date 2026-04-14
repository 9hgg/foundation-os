import { NewlinesToBrPipe } from './newlines-to-br.pipe';

describe('NewlinesToBrPipe', () => {
  let pipe: NewlinesToBrPipe;

  beforeEach(() => {
    pipe = new NewlinesToBrPipe();
  });

  it('returns empty string for null', () => {
    expect(pipe.transform(null)).toBe('');
  });

  it('returns empty string for undefined', () => {
    expect(pipe.transform(undefined)).toBe('');
  });

  it('returns empty string for empty string', () => {
    expect(pipe.transform('')).toBe('');
  });

  it('converts Unix newlines (\\n) to <br>', () => {
    expect(pipe.transform('line1\nline2')).toBe('line1<br>line2');
  });

  it('converts Windows newlines (\\r\\n) to <br>', () => {
    expect(pipe.transform('line1\r\nline2')).toBe('line1<br>line2');
  });

  it('converts old Mac newlines (\\r) to <br>', () => {
    expect(pipe.transform('line1\rline2')).toBe('line1<br>line2');
  });

  it('converts multiple newlines', () => {
    expect(pipe.transform('a\nb\nc')).toBe('a<br>b<br>c');
  });

  it('leaves plain text unchanged', () => {
    expect(pipe.transform('hello world')).toBe('hello world');
  });
});
