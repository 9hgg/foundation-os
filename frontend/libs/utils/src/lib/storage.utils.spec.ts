import { createStorage, getBestStorage, localStorageStrategy, sessionStorageStrategy } from './storage.utils';
import { firstValueFrom } from 'rxjs';

describe('localStorageStrategy/sessionStorageStrategy always resolve to a usable storage', () => {
  // createStorage(undefined) returns undefined whenever the browser denies access to the
  // underlying Storage object (e.g. Safari private mode). Consumers (TranslationService,
  // authTokens.repository, smartRESTStore) call these exports directly with no null check,
  // so they must never be undefined even when the real backend is unavailable.
  it.each([
    ['localStorageStrategy', localStorageStrategy],
    ['sessionStorageStrategy', sessionStorageStrategy],
  ])('%s is always defined and exposes the full StateStorage API', (_name, storage) => {
    expect(storage).toBeDefined();
    expect(typeof storage.getItem).toBe('function');
    expect(typeof storage.setItem).toBe('function');
    expect(typeof storage.removeItem).toBe('function');
    expect(typeof storage.clear).toBe('function');
  });
});

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

  describe('createStorage with a backend that throws on access', () => {
    // Firefox in strict tracking-protection / private-browsing mode: the
    // Storage object exists (typeof check passes) but individual method
    // calls throw NS_ERROR_FAILURE.
    function throwingStorage(): Storage {
      return {
        getItem: () => {
          throw new DOMException('blocked', 'NS_ERROR_FAILURE');
        },
        setItem: () => {
          throw new DOMException('blocked', 'NS_ERROR_FAILURE');
        },
        removeItem: () => {
          throw new DOMException('blocked', 'NS_ERROR_FAILURE');
        },
        clear: () => {
          throw new DOMException('blocked', 'NS_ERROR_FAILURE');
        },
        key: () => null,
        length: 0,
      };
    }

    it('getItem resolves to null instead of throwing', async () => {
      const storage = createStorage(throwingStorage())!;
      const result = await firstValueFrom(storage.getItem('key') as any);
      expect(result).toBeNull();
    });

    it('setItem resolves to false instead of throwing', async () => {
      const storage = createStorage(throwingStorage())!;
      const result = await firstValueFrom(storage.setItem('key', { a: 1 }) as any);
      expect(result).toBe(false);
    });

    it('removeItem resolves to false instead of throwing', async () => {
      const storage = createStorage(throwingStorage())!;
      const result = await firstValueFrom(storage.removeItem('key') as any);
      expect(result).toBe(false);
    });

    it('clear resolves instead of throwing', async () => {
      const storage = createStorage(throwingStorage())!;
      await expect(firstValueFrom(storage.clear() as any)).resolves.toBeUndefined();
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
