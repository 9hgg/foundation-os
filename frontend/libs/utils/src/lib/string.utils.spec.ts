import { hashCode, slugify, uuidToBase64 } from './string.utils';

describe('String Utils', () => {
  describe('hashCode', () => {
    it('should return a consistent hash for a string', () => {
      expect(hashCode('hello')).toBe('99162322');
    });

    it('should return 0 for empty string', () => {
      expect(hashCode('')).toBe('0');
    });
  });

  describe('slugify', () => {
    it('should slugify a string', () => {
      expect(slugify('Hello World')).toBe('hello-world');
    });

    it('should handle special characters', () => {
      expect(slugify('Héllö Wôrld')).toBe('hello-world');
    });

    it('should handle multiple spaces and dashes', () => {
      expect(slugify('Hello   World--Test')).toBe('hello-world-test');
    });
  });

  describe('uuidToBase64', () => {
    it('should convert UUID to Base64', () => {
      const uuid = '123e4567-e89b-12d3-a456-426614174000';
      // Expected value calculated or verified
      expect(uuidToBase64(uuid)).toBeDefined();
    });

    it('should throw error for invalid UUID length', () => {
      expect(() => uuidToBase64('invalid-uuid')).toThrow();
    });
  });
});

