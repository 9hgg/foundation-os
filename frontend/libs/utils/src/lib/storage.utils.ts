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

function createStorage(storage: Storage | undefined): StateStorage | undefined {
	if (!storage) {
		return;
	}

	return {
		getItem(key: string) {
			const v = storage.getItem(key);
			return of(v ? JSON.parse(v) : v);
		},
		setItem(key: string, value: Record<string, any>) {
			storage.setItem(key, JSON.stringify(value));
			return of(true);
		},
		removeItem(key: string) {
			storage.removeItem(key);
			return of(true);
		},
		clear() {
			storage.clear();
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
export const localStorageStrategy = createStorage(tryGetLocalStorage())!;

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
export const sessionStorageStrategy: StateStorage | undefined = createStorage(tryGetSessionStorage())!;

export function getBestStorage(): StateStorage | undefined {
	// We prefer localStorage if available, otherwise we use sessionStorage
	return localStorageStrategy || sessionStorageStrategy;
}
