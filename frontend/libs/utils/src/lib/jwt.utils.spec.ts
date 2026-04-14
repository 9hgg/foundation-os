import { JwtHelper, jwtHelper } from './jwt.utils';

// Helper to build a minimal JWT with a given payload
function buildToken(payload: Record<string, unknown>): string {
  const encode = (obj: unknown) =>
    btoa(JSON.stringify(obj)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const header = encode({ alg: 'HS256', typ: 'JWT' });
  const body = encode(payload);
  return `${header}.${body}.signature`;
}

describe('JwtHelper', () => {
  let helper: JwtHelper;

  beforeEach(() => {
    helper = new JwtHelper();
  });

  describe('decodeToken', () => {
    it('returns null for empty string', () => {
      expect(helper.decodeToken('')).toBeNull();
    });

    it('throws for a non-JWT string (wrong number of parts)', () => {
      expect(() => helper.decodeToken('not.a.valid.jwt.token')).toThrow();
    });

    it('decodes payload correctly', () => {
      const token = buildToken({ sub: '123', name: 'Alice' });
      const result = helper.decodeToken<{ sub: string; name: string }>(token);
      expect(result?.sub).toBe('123');
      expect(result?.name).toBe('Alice');
    });

    it('resolves a Promise<string>', async () => {
      const token = buildToken({ sub: 'async' });
      const result = await helper.decodeToken(Promise.resolve(token));
      expect((result as any)?.sub).toBe('async');
    });
  });

  describe('getTokenExpirationDate', () => {
    it('returns null when no exp claim', () => {
      const token = buildToken({ sub: '1' });
      expect(helper.getTokenExpirationDate(token)).toBeNull();
    });

    it('returns correct Date for exp claim', () => {
      const exp = Math.floor(Date.now() / 1000) + 3600; // 1h from now
      const token = buildToken({ exp });
      const date = helper.getTokenExpirationDate(token) as Date;
      expect(date).toBeInstanceOf(Date);
      expect(date.getTime()).toBeCloseTo(exp * 1000, -3);
    });

    it('resolves a Promise<string>', async () => {
      const exp = Math.floor(Date.now() / 1000) + 3600;
      const token = buildToken({ exp });
      const date = await helper.getTokenExpirationDate(Promise.resolve(token));
      expect(date).toBeInstanceOf(Date);
    });
  });

  describe('isTokenExpired', () => {
    it('returns true for empty string', () => {
      expect(helper.isTokenExpired('')).toBe(true);
    });

    it('returns false when no exp claim (never expires)', () => {
      const token = buildToken({ sub: '1' });
      expect(helper.isTokenExpired(token)).toBe(false);
    });

    it('returns false for a future token', () => {
      const exp = Math.floor(Date.now() / 1000) + 3600;
      const token = buildToken({ exp });
      expect(helper.isTokenExpired(token)).toBe(false);
    });

    it('returns true for a past token', () => {
      const exp = Math.floor(Date.now() / 1000) - 3600;
      const token = buildToken({ exp });
      expect(helper.isTokenExpired(token)).toBe(true);
    });

    it('respects offsetSeconds', () => {
      // expires in 10 seconds, but with 60s offset it should look expired
      const exp = Math.floor(Date.now() / 1000) + 10;
      const token = buildToken({ exp });
      expect(helper.isTokenExpired(token, 60)).toBe(true);
    });

    it('resolves a Promise<string>', async () => {
      const token = buildToken({ sub: '1' });
      const result = await helper.isTokenExpired(Promise.resolve(token));
      expect(result).toBe(false);
    });
  });

  describe('jwtHelper singleton', () => {
    it('is an instance of JwtHelper', () => {
      expect(jwtHelper).toBeInstanceOf(JwtHelper);
    });
  });
});
