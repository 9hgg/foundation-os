import { validateEmail } from './email.utils';

describe('validateEmail', () => {
  it('returns truthy for a standard email', () => {
    expect(validateEmail('user@example.com')).toBeTruthy();
  });

  it('returns truthy for email with subdomain', () => {
    expect(validateEmail('user@mail.example.co.uk')).toBeTruthy();
  });

  it('returns truthy for email with dots in local part', () => {
    expect(validateEmail('first.last@example.com')).toBeTruthy();
  });

  it('returns truthy for email with plus sign', () => {
    expect(validateEmail('user+tag@example.com')).toBeTruthy();
  });

  it('returns falsy for missing @', () => {
    expect(validateEmail('userexample.com')).toBeFalsy();
  });

  it('returns falsy for missing domain', () => {
    expect(validateEmail('user@')).toBeFalsy();
  });

  it('returns falsy for missing local part', () => {
    expect(validateEmail('@example.com')).toBeFalsy();
  });

  it('returns falsy for empty string', () => {
    expect(validateEmail('')).toBeFalsy();
  });

  it('returns falsy for string with spaces', () => {
    expect(validateEmail('user @example.com')).toBeFalsy();
  });

  it('is case insensitive (lowercases before matching)', () => {
    expect(validateEmail('User@Example.COM')).toBeTruthy();
  });
});
