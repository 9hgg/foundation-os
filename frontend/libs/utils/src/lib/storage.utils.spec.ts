import { getBestStorage, localStorageStrategy, sessionStorageStrategy } from './storage.utils';
import { firstValueFrom } from 'rxjs';

describe('storage.utils', () => {
  describe('localStorageStrategy', () => {
    beforeEach(() => localStorage.clear());

    it('setItem stores and getItem retrieves an object', async () => {
      await firstValueFrom(localStorageStrategy.setItem('key', { foo: 'bar' }) as any);
      const result = await firstValueFrom(localStorageStrategy.getItem('key') as any);
      expect(result).toEqual({ foo: 'bar' });
    });

    it('getItem returns null for missing key', async () => {
      const result = await firstValueFrom(localStorageStrategy.getItem('missing') as any);
      expect(result).toBeNull();
    });

    it('removeItem deletes the key', async () => {
      await firstValueFrom(localStorageStrategy.setItem('key', { x: 1 }) as any);
      await firstValueFrom(localStorageStrategy.removeItem('key') as any);
      const result = await firstValueFrom(localStorageStrategy.getItem('key') as any);
      expect(result).toBeNull();
    });

    it('clear removes all keys', async () => {
      await firstValueFrom(localStorageStrategy.setItem('a', { v: 1 }) as any);
      await firstValueFrom(localStorageStrategy.setItem('b', { v: 2 }) as any);
      await firstValueFrom(localStorageStrategy.clear() as any);
      const result = await firstValueFrom(localStorageStrategy.getItem('a') as any);
      expect(result).toBeNull();
    });
  });

  describe('getBestStorage', () => {
    it('returns a defined storage', () => {
      const storage = getBestStorage();
      expect(storage).toBeDefined();
    });

    it('prefers localStorageStrategy when available', () => {
      const storage = getBestStorage();
      // localStorageStrategy is available in jsdom
      expect(storage).toBe(localStorageStrategy);
    });
  });
});
