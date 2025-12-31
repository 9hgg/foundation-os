/* eslint-disable @typescript-eslint/no-explicit-any */
import { BehaviorSubject, Observable } from 'rxjs';
import { finalize, shareReplay, tap } from 'rxjs/operators';
import { isEqual } from './equal.utils';
import { cloneDeep } from 'lodash-es';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

const DEBUG_GET = false;
const DEBUG_SET = false;

/** Utility type to add `<propertyName>$` extensions --> each property is now observable */
export type BehaviorExtensions<T> = {
	/** property as obsersable */
	[K in keyof T as `${string & K}$`]: Observable<T[K]>;
} & NestedBehaviorExtension<T>;

/** Recursive type to apply `<propertyName>$` extensions to nested properties */
export type NestedBehaviorExtension<T> = {
	[P in keyof T]: BehaviorExtensions<T[P]>;
};

export interface BasicBehaviorSubjectProxy<T> {
	/** completeAllObservables */
	completeAllObservables: () => void;
	/** access the object as an observable with `.$` */
	$: Observable<T>;
	/** destroy */
	destroy: () => void;
	/** direct access to the original object */
	_: T;
	/** List all behavior subjects created by the proxy and nested proxies */
	__behaviorSubjects: Record<string, BehaviorSubject<any>>;
	/** List all observables created by the proxy and nested proxies */
	__observables: Record<string, Observable<any>>;

	/** Needed to allow any properties to be added on the fly */
	[key: string]: any;
}

export type BehaviorSubjectProxy<T> = T & BehaviorExtensions<T> & BasicBehaviorSubjectProxy<T>;

/**
 * Create a proxy that will create an observable for each property accessed
 * - Classic pattern is to use the `$` property to access the root object as an observable
 * - Good naming practice is to add a `$_` at the end
 * @param obj_
 * @param onGet
 * @param onSet
 * @param onHas
 * @returns
 */
export function createBehaviorSubjectProxy<T extends object>(obj_: T, onGet?: (path: string, value: any) => void, onSet?: (path: string, value: any) => void, onHas?: (path: string, value: any) => void): BehaviorSubjectProxy<T> {
	// if (DEBUG) console.log('[createBehaviorSubjectProxy]', { obj_ });

	return _createBehaviorSubjectProxy(
		//
		obj_,
		onGet,
		onSet,
		onHas
	) as BehaviorSubjectProxy<T>;
}

function _createBehaviorSubjectProxy<T extends object>(obj_: T, onGet?: (path: string, value: any) => void, onSet?: (path: string, value: any) => void, onHas?: (path: string, value: any) => void, behaviorSubjects: Record<string, BehaviorSubject<any>> = {}, observables: Record<string, Observable<any>> = {}, parentPath: string = '', originalObject?: any): BehaviorExtensions<T> {
	const obj = obj_ as BehaviorExtensions<T>;
	originalObject = originalObject ?? obj_;

	const completeAllObservables = () => {
		Object.values(behaviorSubjects).forEach((behaviorSubject) => {
			behaviorSubject.complete();
		});
		if (DEBUG_GET) console.log('All observables have been completed.');
	};

	const destroy = () => {
		// complete all observables
		completeAllObservables();
		// delete all observables
		Object.keys(behaviorSubjects).forEach((key) => {
			delete behaviorSubjects[key];
		});
		Object.keys(observables).forEach((key) => {
			delete observables[key];
		});
	};

	const set = (target: BehaviorExtensions<T>, property: string | symbol, newValue: any, proxy: any) => {
		if (typeof property === 'string') {
			if (DEBUG_SET) console.log('[set]', property, { proxyDetails: { newValue, property, target, proxy } });

			// Split the property into parts if it's a nested path
			const pathParts = property.split('.');
			let currentTarget = target as any;
			let fullPath = parentPath;

			const pathsToUpdate: string[] = [];

			// Iterate over the path parts to handle nested properties
			// but stop before the last part
			for (let i = 0; i < pathParts.length - 1; i++) {
				const part = pathParts[i];
				fullPath = fullPath ? `${fullPath}.${part}` : part;

				// If the current target is not an object or does not have the part, replace or create it
				if (typeof currentTarget[part] !== 'object' || !Reflect.has(currentTarget, part)) {
					if (DEBUG_SET) console.log('[set] intermediate object does not exist, we created it', part, fullPath);
					Reflect.set(currentTarget, part, {});
					pathsToUpdate.push(fullPath);
				}

				// Move to the next level in the target object
				currentTarget = Reflect.get(currentTarget, part);
			}

			// Handle the final property in the path
			const finalProperty = pathParts[pathParts.length - 1];
			fullPath = fullPath ? `${fullPath}.${finalProperty}` : finalProperty;
			const existingValue = Reflect.get(currentTarget, finalProperty);

			if (!isEqual(newValue, existingValue)) {
				// return true;
				pathsToUpdate.push(fullPath);
				if (DEBUG_SET) console.log('[set] final property updated:', fullPath, newValue);
				Reflect.set(currentTarget, finalProperty, cloneDeep(newValue));
			}
			// if new value is undefined and existing value is undefined, we set it to undefined
			else if (newValue === undefined && existingValue === undefined) {
				pathsToUpdate.push(fullPath);
				if (DEBUG_SET) console.log('[set] final property updated (undefined):', fullPath, newValue);
				Reflect.set(currentTarget, finalProperty, newValue);
			} else {
				if (DEBUG_SET) console.log('[set] final property not updated (same):', fullPath, newValue);
			}

			if (pathsToUpdate.length === 0) {
				if (DEBUG_SET) console.log('%c[set] no paths to update', 'color:red');
				return true;
			}

			// Optional set callback
			if (onSet) {
				onSet(fullPath, newValue);
			}

			// only the observed values may need to be updated/removed
			if (DEBUG_SET) {
				console.log('[set] pathsToUpdate:', pathsToUpdate, ''.concat(...Object.entries(behaviorSubjects).map((k) => k[0] + ', ')));
			}

			Object.keys(behaviorSubjects).forEach((alreadyObservedKey) => {
				if (DEBUG_SET)
					console.log(
						'[set] UPDATE.observed$ checking:',
						alreadyObservedKey,
						pathsToUpdate,
						pathsToUpdate.some((path) => alreadyObservedKey.startsWith(path))
					);
				if (pathsToUpdate.some((path) => path.startsWith(alreadyObservedKey)) && alreadyObservedKey !== '$') {
					if (DEBUG_SET) console.log('[set] UPDATE.observed$ CONCERNED:', alreadyObservedKey, pathsToUpdate, obj_);

					// reduce the alreadyObservedKey on the originalObject
					const newValue = alreadyObservedKey.split('.').reduce((acc, key) => (acc ? acc[key] : undefined), originalObject);

					if (!isEqual(newValue, behaviorSubjects[alreadyObservedKey].value)) {
						if (DEBUG_SET) console.log('[set] UPDATE.observed$ updating:', alreadyObservedKey, newValue);

						behaviorSubjects[alreadyObservedKey].next(cloneDeep(newValue));
					} else {
						if (DEBUG_SET) console.log('[set] UPDATE.observed$ same value:', alreadyObservedKey, newValue);
					}
				} else {
					if (DEBUG_SET) if (alreadyObservedKey !== '$') console.log('[set] UPDATE.observed$ not concerned:', alreadyObservedKey, pathsToUpdate, obj_);
				}
			});
			// 3) update the observable over the root property
			if (behaviorSubjects['$']) {
				if (DEBUG_SET) console.log('[set] UPDATE.observed$ ROOT may need update:', originalObject, obj_, behaviorSubjects['$'].value);
				const newValue = cloneDeep(originalObject);
				if (!isEqual(newValue, behaviorSubjects['$'].value)) {
					if (DEBUG_SET) console.log('[set] UPDATE.observed$ ROOT updated:', originalObject, obj_);
					behaviorSubjects['$'].next(newValue);
				} else {
					if (DEBUG_SET) console.log('[set] UPDATE.observed$ ROOT not updated:', newValue);
				}
			}

			return true;
		}

		return Reflect.set(target, property, newValue, proxy);
	};

	if (obj && typeof obj === 'object' && !Object.isFrozen(obj)) {
		return new Proxy(obj, {
			// ... [previous code] ...

			get(target, property, proxy) {
				if (typeof property === 'string') {
					if (DEBUG_GET) console.log('[get]', property, { proxyDetails: { property, target, proxy } });

					if (property === 'completeAllObservables') {
						return completeAllObservables;
					} else if (property == '__observables') {
						return observables;
					} else if (property == '__behaviorSubjects') {
						return behaviorSubjects;
					} else if (property == '_') {
						return obj_;
					} else if (property == '$' && !parentPath) {
						if (DEBUG_GET) console.log('[get] root property $:', obj_);
						if (!behaviorSubjects['$']) {
							if (DEBUG_GET) console.log("[get] root property $ does not exist, let's create it:", obj_);
							behaviorSubjects['$'] = new BehaviorSubject(cloneDeep(obj_));
							observables['$'] = behaviorSubjects['$'].pipe(
								shareReplay(1),
								tap((value) => {
									if (DEBUG_GET) console.log('[get] root property $ updated:', value);
								}),
								finalize(() => {
									if (DEBUG_GET) console.log('[get] finalize', '$');
								})
							);
						}
						return observables['$'];
					} else if (property == 'destroy') {
						return destroy;
					} else if (property == 'push') {
						// should act like the Array.prototype.push method but using the set of the proxy
						return function (...args: any[]) {
							const length = Reflect.get(target, 'length') as unknown as number;
							args.forEach((arg, index) => {
								set(target, length + index + '', arg, proxy);
							});
							return length + args.length;
						};
					}

					// Check if property contains dots indicating nested properties
					const pathParts = property.split('.');
					let currentTarget = target as any;
					let fullPath = parentPath;
					const isObservableAccess = property.endsWith('$');

					// Iterate over the path parts to handle nested properties
					for (let i = 0; i < pathParts.length; i++) {
						let part = pathParts[i];
						fullPath = fullPath ? `${fullPath}.${part}` : part;

						// Check if it's the last part and an observable access
						if (isObservableAccess && i === pathParts.length - 1) {
							part = part.slice(0, -1); // Remove the '$'
							fullPath = fullPath.slice(0, -1); // Adjust the fullPath
							if (DEBUG_GET) console.log('[get] observable access', { part, fullPath });
						}

						// Create intermediate objects if they don't exist
						if (typeof currentTarget[part] !== 'object' || !Reflect.has(currentTarget, part)) {
							// it is an intermediate key, we create it if missing or we replace it by an object if it is not an object

							if (i < pathParts.length - 1) {
								// not last part
								Reflect.set(currentTarget, part, {});
								if (DEBUG_GET) console.log('[get] intermediate object does not exist, we created it', part, fullPath);
							}
							// else if (isObservableAccess) {
							// 	// last part and observable access
							// 	// we do nothing but we avoid returning undefined
							// }
							else {
								// 	// it is the last part
								// 	// Optional get callback
								// 	if (onGet) {
								// 		onGet(fullPath, currentTarget);
								// 	}
								if (DEBUG_GET) console.log('[get] doing nothing', part, fullPath, Reflect.has(currentTarget, part));
								// 	return undefined; // Return undefined or throw an error for non-existing properties
							}
						}

						currentTarget = Reflect.get(currentTarget, part);

						// Handling function properties
						if (i === pathParts.length - 1 && typeof currentTarget === 'function') {
							if (DEBUG_GET) console.log('[get] method access', { part, fullPath });
							return currentTarget.bind(target);
						}

						// Handle observable access for the last part
						if (isObservableAccess && i === pathParts.length - 1) {
							if (!observables[fullPath]) {
								behaviorSubjects[fullPath] = new BehaviorSubject(cloneDeep(currentTarget));
								observables[fullPath] = behaviorSubjects[fullPath].pipe(
									shareReplay(1),
									finalize(() => {
										if (DEBUG_GET) console.log('[get] finalize', fullPath);
									})
								);
							}
							if (DEBUG_GET) console.log('[get] observable access, returning observable', fullPath);
							return observables[fullPath];
						}
					}

					// Optional get callback
					if (onGet) {
						onGet(fullPath, currentTarget);
					}

					if (currentTarget && typeof currentTarget === 'object') {
						if (DEBUG_GET) console.log('[get] returning proxied currentTarget', currentTarget);
						return _createBehaviorSubjectProxy(currentTarget, onGet, onSet, onHas, behaviorSubjects, observables, fullPath, originalObject);
					}
					if (DEBUG_GET) console.log('[get] returning default currentTarget', currentTarget);
					return currentTarget;
				}
				return Reflect.get(target, property, proxy);
			},
			set,
			deleteProperty(target, property) {
				if (typeof property !== 'symbol') {
					if (DEBUG_SET) console.log('[deleteProperty]', { property, target, receiver: obj_ });

					const fullPath = parentPath ? `${parentPath}.${property}` : property;
					const existingValue = Reflect.get(target, property, obj_);

					// Optional set callback
					if (onSet) {
						onSet(fullPath, undefined);
					}

					const result = Reflect.deleteProperty(target, property);

					// 0) clean the removed properties below the current one
					Object.keys(behaviorSubjects).forEach((existingObsKey) => {
						if (existingObsKey.startsWith(fullPath + '.')) {
							// 0.1) reflect the key to see if the sub-property exists
							const subPropertyKey = existingObsKey.slice(fullPath.length + 1);
							const subPropertyExists = Reflect.has(target, subPropertyKey);
							if (DEBUG_SET) console.log('[deleteProperty] subPropertyExists:', existingObsKey, subPropertyKey, subPropertyExists);
							// 0.2) if the sub-property does not exist, clean the observable
							if (!subPropertyExists) {
								if (DEBUG_SET) console.log('[deleteProperty] sub property removed:', existingObsKey);
								behaviorSubjects[existingObsKey].complete();
								delete behaviorSubjects[existingObsKey];
								delete observables[existingObsKey];
							} else {
								// 0.3) if the sub-property exists, update the observable
								if (DEBUG_SET) console.log('[deleteProperty] sub property updated:', existingObsKey);
								// behaviorSubjects[key].next(Reflect.get(target, subPropertyKey));
							}
						}
					});

					// 1) complete the observable over the current property
					if (behaviorSubjects[fullPath]) {
						behaviorSubjects[fullPath].complete();
						delete behaviorSubjects[fullPath];
						delete observables[fullPath];
					}

					// 2) update the observable over the parent property
					Object.keys(behaviorSubjects).forEach((existingObsKey) => {
						if (fullPath.startsWith(existingObsKey + '.')) {
							if (DEBUG_SET) console.log('[deleteProperty] parent property updated:', existingObsKey, obj_);
							behaviorSubjects[existingObsKey].next(Reflect.get(originalObject, existingObsKey));
						}
					});
				}
				return Reflect.deleteProperty(target, property);
			},
			has(target, property) {
				return Reflect.has(target, property);
				// const has2 = property in target;
				// if (typeof property === 'string') {
				// 	const b = (target as any)[property];
				// 	if (DEBUG) console.log('[has]', has, has2, b,{ property, target });
				// }
				// return has;
			},
		});
	}
	return obj;
}

/**
 * Sync a behavior subject proxy with a local storage key
 *
 * Example:
 * ```typescript
 *
 * interactionTokens$_;
 * constructor() {
 * 	this.interactionTokens$_ = behaviorSubjectProxyStored<{ [interactionId: string]: string }>(
 * 	'interactionTokens',
 * 	{}
 * 	);
 * 	}
 *
 * ```
 * @param localStorageKey
 * @param defaultValue
 * @returns
 */
export function behaviorSubjectProxyStored<T extends object>(localStorageKey: string, defaultValue: T) {
	const valueAsStr = localStorage.getItem(localStorageKey);
	const value = valueAsStr ? (JSON.parse(valueAsStr) as T) : defaultValue;

	const prop = createBehaviorSubjectProxy(value);
	prop.$.pipe(
		takeUntilDestroyed(),
		tap((value) => {
			localStorage.setItem(localStorageKey, JSON.stringify(value));
		})
	).subscribe();

	return prop;
}
