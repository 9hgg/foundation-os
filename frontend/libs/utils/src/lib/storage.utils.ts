import { Observable, of } from 'rxjs';

export type Async<T> = Promise<T> | Observable<T>;

/**
 * We use Async to support later the use of alternative storage strategies
 */
export interface StateStorage {
	getItem<T extends Record<string, any>>(key: string): Async<T | null | undefined>;

	setItem(key: string, value: Record<string, any>): Async<boolean>;

	removeItem(key: string): Async<boolean | void>;

	clear(): Async<void>;
}

export function createStorage(storage: Storage | undefined): StateStorage | undefined {
	if (!storage) {
		return;
	}

	return {
		getItem(key: string) {
			try {
				const v = storage.getItem(key);
				return of(v ? JSON.parse(v) : v);
			} catch {
				return of(null);
			}
		},
		setItem(key: string, value: Record<string, any>) {
			try {
				storage.setItem(key, JSON.stringify(value));
				return of(true);
			} catch {
				return of(false);
			}
		},
		removeItem(key: string) {
			try {
				storage.removeItem(key);
				return of(true);
			} catch {
				return of(false);
			}
		},
		clear() {
			try {
				storage.clear();
			} catch {
				// no-op — nothing to clear if storage rejects the call
			}
			return of(undefined);
		},
	};
}

// we need to wrap the access to window.localStorage and window.sessionStorage in a try catch
// because localStorage can be disabled, or be denied by a security rule
// as soon as we access the property, it throws an error
const tryGetLocalStorage = () => {
	try {
		if (typeof localStorage !== 'undefined') {
			return localStorage;
		}
	} catch {
		// eslint-disable-next-line no-empty
	}
	return undefined;
};
// used whenever the browser denies access to storage entirely (e.g. Safari private mode),
// so callers can rely on localStorageStrategy/sessionStorageStrategy always being defined
const noopStorage: StateStorage = {
	getItem: () => of(null),
	setItem: () => of(false),
	removeItem: () => of(false),
	clear: () => of(undefined),
};

const rawLocalStorage = createStorage(tryGetLocalStorage());
export const localStorageStrategy: StateStorage = rawLocalStorage ?? noopStorage;

const tryGetSessionStorage = () => {
	try {
		if (typeof sessionStorage !== 'undefined') {
			return sessionStorage;
		}
	} catch {
		// eslint-disable-next-line no-empty
	}
	return undefined;
};
const rawSessionStorage = createStorage(tryGetSessionStorage());
export const sessionStorageStrategy: StateStorage = rawSessionStorage ?? noopStorage;

export function getBestStorage(): StateStorage {
	// We prefer localStorage if available, otherwise we use sessionStorage
	return rawLocalStorage ?? rawSessionStorage ?? noopStorage;
}
