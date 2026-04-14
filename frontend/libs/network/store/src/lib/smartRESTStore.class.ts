import { Acl } from '@foundation/acls/model';
import { LightPaginatedResponse, PaginatedResponse, PaginatedResponseHoled, PaginatedResponseKeys, RequestService } from '@foundation/network/services';
import { anyToObservable, BehaviorSubjectReplayed, BehaviorSubjectReplayedFromObs, getBestStorage, TabManagerService } from '@foundation/utils';
import { inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { BehaviorSubject, combineLatest, map, NEVER, Observable, of, shareReplay, skipUntil, Subject, switchMap, take, tap } from 'rxjs';

const alert = console.error;

const DEBUG = false;

export interface Filter {
	// field_name: str
	fieldName: string;
	// value: str
	value: any;
	// match_type: str = "exact"  # Default to exact match
	matchType?: 'exact' | 'partial';
	// comparison: typing.Optional[str] = None  # For numerical and datetime comparisons
	comparison?: '>' | '>=' | '<' | '<=' | '<>';
}

const storage = getBestStorage();

export function convertFilterToQueryString(filter: Filter) {
	return filter.fieldName + ':' + filter.value + ':' + (filter.matchType ?? 'exact') + (filter.comparison ? ':' + filter.comparison : '');
}

export function convertQueryStringToFilter(queryString: string): Filter | null {
	if (queryString.length == 0) {
		// empty
		return null;
	}
	const parts = queryString.split(':');
	if (parts.length < 2) {
		console.error('Invalid query string:', queryString);
		return null;
	}
	const fieldName = parts[0];
	const value = parts[1];
	const matchType = parts[2] ?? 'exact';
	const comparison = parts[3] ?? undefined;
	const filter: Filter = {
		fieldName,
		value,
		matchType: matchType as Filter['matchType'],
	};
	if (comparison) {
		filter.comparison = comparison as Filter['comparison'];
	}
	return filter;
}

export class SmartRestStore<ObjectType extends { id: string }> {
	_requestService = inject(RequestService);
	_tabManagerService = inject(TabManagerService);

	objects$$$: BehaviorSubjectReplayed<ObjectType[]>;
	objects$ByIds = new Map<string, BehaviorSubjectReplayed<ObjectType | null>>();

	// map a query as string to a map of page number to object id[]
	objectsPageInfos = new Map<string, LightPaginatedResponse<ObjectType>>();

	// TODO: implement local storage cache strategy
	// storage: StateStorage = localStorageStrategy;
	// storeName = 'rest-' + this._name;

	bc: BroadcastChannel | undefined;

	notifier$ = new Subject<{
		type: 'local-upsert';
		object: ObjectType;
	}>();

	constructor(
		//
		private _restEndpoint: string,
		private _name: string,
		enableCache: boolean = false,
		enableBroadcastChannel: boolean = true
	) {
		this.objects$$$ = new BehaviorSubjectReplayed<ObjectType[]>([]);

		this._initializeBroadcastChannel(enableBroadcastChannel);
		this._initializeStorageCache(enableCache);
		this._initializeClearCacheSubscription();
	}

	/**
	 * Pulls objects of a specific page and page size from the server
	 * @param page
	 * @param pageSize
	 * @returns the response from the server
	 */
	pullObjects$(page: number, pageSize: number, filters: Filter[], orderingBy: string | undefined, ignoreAnonymous: boolean = true, bypass_acls: boolean = false) {
		if (DEBUG) console.log('[smartRestStore](pullObjects$) ', this._restEndpoint, 'page', page, 'pageSize', pageSize, 'filters', filters, 'orderingBy', orderingBy);
		return this._requestService
			.getObjectList$<ObjectType>(this._restEndpoint, {
				page,
				page_size: pageSize,
				filters: filters.map((f) => convertFilterToQueryString(f)),
				...(orderingBy ? { ordering_by: orderingBy } : {}),
				ignore_anonymous: ignoreAnonymous,
				bypass_acls: bypass_acls,
			})
			.pipe(
				// delay(5000),
				tap((response) => {
					if (response.error) {
						alert(response.error.title);
						return;
					}
					this.upsertObjects(response.result.data);
				})
				// map((res) => res.results)
			);
	}

	/**
	 * Pulls all objects from the server
	 * @returns the response from the server
	 */
	pullAllObjects$() {
		return this._requestService.getBasic$<ObjectType[]>(this._restEndpoint + '/all').pipe(
			tap((response) => {
				if (response.error) {
					alert(response.error.title);
					return;
				}
				this.upsertObjects(response.result);
			})
		);
	}

	/**
	 * Pulls all objects from the server and
	 * @returns returns an observable of the objects that keeps updating
	 * If a specific object is not yet in the store, it will be in the list as null until it is pulled
	 */
	pullAllObjectsAndObserve$(): Observable<(ObjectType | null)[]> {
		return this.pullAllObjects$().pipe(
			switchMap((response) => {
				if (DEBUG) console.log('[smartRESTStore](pullAllAndObserve$) response', response);
				const result = response.result ?? [];
				if (result.length === 0) {
					return of([]);
				}
				return combineLatest(
					result.map((object) => {
						return this.getObjectById$$$(object.id).$;
					})
				);
			})
		);
	}

	getAclsForObject$(objectId: string) {
		return this._requestService.getBasic$<Acl[]>('/api/acls/for/' + this._name + '/' + objectId).pipe(
			tap((response) => {
				if (response.error) {
					alert(response.error.title);
					return;
				}
			})
		);
	}

	toggleAnonymousReadForObject$(objectId: string) {
		return this._requestService.getBasic$<Acl[]>('/api/acls/for/' + this._name + '/' + objectId + '/toggle-anonymous-read').pipe(
			tap((response) => {
				if (response.error) {
					alert(response.error.title);
					return;
				}
			})
		);
	}

	/**
	 * Pulls a single object from the server and adds it to the store
	 * @param id
	 * @returns the response from the server
	 */
	pullObject$(id: string) {
		if (DEBUG) console.log('[smartRestStore](pullObject$) id', id);
		return this._requestService
			.getObject$<ObjectType>(this._restEndpoint + '/' + id, undefined, {
				// extraHeaders: { toCache: '' + 5 * 1000 },
			})
			.pipe(
				tap((response) => {
					if (response.error) {
						alert(response.error.title);
						return;
					}
					this.upsertObjectLocally(response.result.data);
				})
			);
	}

	pullObjectSimplified$(id: string) {
		return this._requestService.getObject$<ObjectType>(this._restEndpoint + '/' + id + '/simplified').pipe(
			tap((response) => {
				if (response.error) {
					alert(response.error.title);
					return;
				}
				this.upsertObjectLocally(response.result.data);
			})
		);
	}

	/**
	 * Pulls a single object from the server and adds it to the store
	 * @param id
	 * @returns the response from the server
	 */
	pullObjectBy$(key: keyof ObjectType, value: ObjectType[keyof ObjectType]) {
		if (DEBUG) console.log('[smartRestStore](pullObjectBy$) key', key, 'value', value);

		return this._requestService.getObject$<ObjectType>(this._restEndpoint + '/by/' + (key as string) + '/' + value).pipe(
			tap((response) => {
				if (response.error) {
					alert(response.error.title);
					return;
				}
				this.upsertObjectLocally(response.result.data);
			})
		);
	}

	/**
	 * Get objects from the store at a specific page and page size
	 * Do the request if the objects are not in the store
	 * The `${page}-${pageSize}-${filtersAsString}-${orderingBy}` is used as a key to store the ids of the objects in the store for that specific page
	 * @param page
	 * @param pageSize
	 * @param forceRequest  if true, the objects will be pulled from the server even if they are already in the store
	 * @returns
	 */
	getObjects$(page: number, pageSize: number, filters: Filter[], orderingBy: string | undefined, forceRequest: boolean, ignoreAnonymous: boolean = true, bypass_acls: boolean = false) {
		if (DEBUG) console.log('[smartRestStore](getObjects$)', this._restEndpoint, 'page', page, 'pageSize', pageSize, 'filters', filters, 'orderingBy', orderingBy);

		const filtersAsString = filters.map((f) => convertFilterToQueryString(f)).join('_');
		let queryAsString = `${page}-${pageSize}-${filtersAsString}-${orderingBy}`;
		if (bypass_acls) {
			queryAsString += '-bypass_acls';
		}
		if (forceRequest) {
			this.objectsPageInfos.clear();
		}

		const pageInfosForQuery = this.objectsPageInfos.get(queryAsString);
		let resultFromCache$: Observable<PaginatedResponseHoled<ObjectType>>;
		if (pageInfosForQuery) {
			const objectIds = pageInfosForQuery.dataIds;
			const paginatedResponseDetails = pageInfosForQuery.paginatedResponseDetails;
			const objects$: Observable<(ObjectType | null)[]> = objectIds.length > 0 ? combineLatest(objectIds.map((objectId) => this.getObjectById$$$(objectId).$)) : of([]);
			resultFromCache$ = objects$.pipe(
				map((objects) => {
					const reconstructedPaginatedResponse: PaginatedResponseHoled<ObjectType> = {
						...paginatedResponseDetails,
						data: objects,
					};
					return reconstructedPaginatedResponse;
				})
			);
		} else {
			resultFromCache$ = NEVER;
		}

		const source$ = new BehaviorSubject<{ source: string; obs: Observable<PaginatedResponseHoled<ObjectType>> }>({
			source: 'cache',
			obs: resultFromCache$.pipe(
				tap((r) => {
					if (DEBUG) console.log('%c[smartRestStore](getObjects$) returning cached result', 'color: green;', r);
				})
			),
		});

		const resultFromRequest$ = this.pullObjects$(page, pageSize, filters, orderingBy, ignoreAnonymous, bypass_acls).pipe(
			switchMap((response) => {
				if (response.error) {
					throw response.error;
				}
				const objectIds: string[] = response.result.data.map((object) => object.id);
				const lightPaginatedResponseData: Record<string, any> = {};
				PaginatedResponseKeys.forEach((key) => {
					if (key !== 'data') {
						// @ts-expect-error we know that the key is in the response
						lightPaginatedResponseData[key] = response.result[key];
					}
				});

				const lightPaginatedResponse: LightPaginatedResponse<ObjectType> = {
					paginatedResponseDetails: lightPaginatedResponseData as Omit<PaginatedResponse<ObjectType>, 'data'>,
					dataIds: objectIds,
				};

				this.objectsPageInfos.set(queryAsString, lightPaginatedResponse);
				this._saveInStorage(this.objects$$$.value);

				const rebuiltRequestAsReactive$ = (
					response.result.data.length > 0
						? combineLatest(
								response.result.data.map((object) => {
									return this.getObjectById$$$(object.id).$;
								})
							)
						: of([])
				).pipe(
					map((reactiveObjects) => {
						// objects are reactive to the store (vs the one coming from the server)
						// this way, even if the store is updated, the objects will be updated where this request is used
						const reconstructedPaginatedResponse: PaginatedResponseHoled<ObjectType> = {
							...response.result,
							data: reactiveObjects,
						};
						return reconstructedPaginatedResponse;
					})
				);

				source$.next({
					source: 'request',
					obs: rebuiltRequestAsReactive$.pipe(
						tap((r) => {
							if (DEBUG) console.log('%c[smartRestStore](getObjects$) rebuilt request result', 'color: purple;', r);
						})
					),
				});
				return rebuiltRequestAsReactive$;
			})
		);

		resultFromRequest$.subscribe();

		return source$.pipe(
			tap((x) => {
				if (DEBUG) console.log('[smartRestStore](getObjects$) source$', x.source, this._restEndpoint);
			}),
			switchMap((x) => x.obs)
		);

		// return of(resultFromRequest$).pipe(switchMap((x) => x));
	}
	upsertObjectLocally(newObject: ObjectType, broadcast: boolean = false): ObjectType {
		const objects = this.objects$$$.value;
		// replace the object in the list if it already exists
		const index = objects.findIndex((object) => object.id === newObject.id);
		if (index !== -1) {
			objects[index] = newObject;
		} else {
			objects.push(newObject);
		}
		// sort the list
		objects.sort((a, b) => a.id.localeCompare(b.id));
		// update the list
		if (DEBUG) console.log('[smartRestStore](upsertObjectLocally) objects', newObject, objects);

		if (broadcast)
			this.bc?.postMessage({
				type: 'upsert',
				tab: this._tabManagerService.tabId.substring(0, 8), // first 8 characters of the tab id
				endpoint: this._restEndpoint,
				name: this._name,
				timestamp: Date.now(),
				object: newObject,
			});

		this.objects$$$.next(objects);
		return newObject;
	}

	/**
	 * Upsert multiple objects in the store (replace existing, add new ones then sort the list by id)
	 *
	 * same as upsertObject but for multiple objects, avoids multiple sorts
	 * @param newObjects
	 * @returns
	 */
	upsertObjects(newObjects: ObjectType[]): ObjectType[] {
		const objects = this.objects$$$.value;

		for (const newObject of newObjects) {
			// replace the object in the list if it already exists
			const index = objects.findIndex((object) => object.id === newObject.id);
			if (index !== -1) {
				objects[index] = newObject;
			} else {
				objects.push(newObject);
			}
		}
		// sort the list
		objects.sort((a, b) => a.id.localeCompare(b.id));
		// update the list
		this.objects$$$.next(objects);

		return newObjects;
	}

	private getOrCreateObjectSubject$(id: string) {
		const a = this.objects$ByIds.get(id);
		if (a) return a;
		const newSubject = BehaviorSubjectReplayedFromObs(
			null,
			this.objects$$$.pipe(
				tap((objects) => {
					if (DEBUG)
						console.log(
							'[smartRestStore](getObjectById$$$) object',
							id,
							objects.find((object) => object.id === id)
						);
				}),
				map((objects) => objects.find((object) => object.id === id) ?? null)
			)
		);
		this.objects$ByIds.set(id, newSubject);
		return newSubject;
	}

	getObjectById$$$(id: string, forcePull: boolean = false, simplified: boolean = false): BehaviorSubjectReplayed<ObjectType | null> {
		if (simplified) {
			this.pullObjectSimplified$(id).subscribe();
		} else if (forcePull) {
			//pull the object from the server
			this.pullObject$(id).subscribe();
		}

		return this.getOrCreateObjectSubject$(id);
	}

	/**
	 * to be used instead of getObjectById$$$ to avoid requesting if already done
	 * @param id
	 * @returns
	 */
	getObjectByIdPullOnce$$$(id: string): BehaviorSubjectReplayed<ObjectType | null> {
		const valueInStore = this.objects$$$.value.find((object) => object.id === id);
		if (!valueInStore) {
			//pull the object from the server
			this.pullObject$(id).subscribe();
		}

		return this.getOrCreateObjectSubject$(id);
	}

	/**
	 * REST operation on the PUT endpoint
	 * @param object
	 * @returns
	 */
	putObject$(object: ObjectType) {
		return this._requestService.putObject$<ObjectType>(this._restEndpoint + '/' + object.id, object).pipe(
			tap((response) => {
				if (response.error) {
					alert(response.error.title + ': ' + response.error.description);
					return;
				}
				this.upsertObjectLocally(response.result.data, true);
			})
		);
	}

	/**
	 * REST operation on the POST endpoint
	 * @param newObject
	 */
	postObject$(newObject: ObjectType) {
		return this._requestService
			.postObject$(
				//

				this._restEndpoint,
				newObject
			)
			.pipe(
				tap((response) => {
					if (response.error) {
						alert(response.error.title + ': ' + response.error.description);
						return;
					}
					this.upsertObjectLocally(response.result.data, true);
				})
			);
	}

	deleteObject$(objectId: ObjectType['id']) {
		return this._requestService.deleteObject$<ObjectType>(this._restEndpoint + '/' + objectId).pipe(
			tap((response) => {
				if (response.error) {
					alert(response.error.title + ': ' + response.error.description);
					return;
				}

				const objects = this.objects$$$.value;
				const index = objects.findIndex((object) => object.id === objectId);
				objects.splice(index, 1);
				this.objects$$$.next(objects);
			})
		);
	}

	// EXTRA

	save(object: ObjectType) {
		const obs = this.putObject$(object).pipe(shareReplay(1));
		obs.subscribe();
		return obs;
	}

	applyPatch(objectId: ObjectType['id'], patch: Partial<ObjectType>) {
		const obs = this._requestService.patchObject$<ObjectType>(this._restEndpoint + '/' + objectId, patch).pipe(
			tap((response) => {
				if (response.error) {
					alert(response.error.title + ': ' + response.error.description);
					return;
				}
				this.upsertObjectLocally(response.result.data, true);
			}),
			shareReplay(1)
		);
		obs.subscribe();
		return obs;
	}

	_saveInStorage(objects: ObjectType[]) {
		const storedObjects: {
			objects: ObjectType[];
			pageInfos: Record<string, LightPaginatedResponse<ObjectType>>;
		} = { objects, pageInfos: {} as Record<string, LightPaginatedResponse<ObjectType>> };

		this.objectsPageInfos.forEach((value, key) => {
			storedObjects.pageInfos[key] = value;
		});

		storage?.setItem(this._restEndpoint, storedObjects);
	}

	private _initializeBroadcastChannel(enableBroadcastChannel: boolean) {
		if (!enableBroadcastChannel) return;

		this.bc = new BroadcastChannel('smartRestStore-' + this._restEndpoint);
		this.bc.onmessage = (event) => {
			const eventData = event.data;
			if (DEBUG) console.log('[smartRestStore](bc.onmessage) received message', eventData);

			if (eventData.type === 'upsert') {
				if (DEBUG) console.log('[smartRestStore](bc.onmessage) upserting object', eventData.object);
				this.upsertObjectLocally(eventData.object, false);
				this.notifier$.next({
					type: 'local-upsert',
					object: eventData.object,
				});
			} else {
				if (DEBUG) console.log('[smartRestStore](bc.onmessage) received message of type', eventData.type, 'but not handled');
			}
		};
		this.bc.postMessage({
			type: 'init',
			tab: this._tabManagerService.tabId.substring(0, 8), // first 8 characters of the tab id
			endpoint: this._restEndpoint,
			name: this._name,
			timestamp: Date.now(),
		});
	}

	private _initializeStorageCache(enableCache: boolean) {
		if (!enableCache) return;

		this.objects$$$
			.pipe(
				takeUntilDestroyed(),
				// skipUntil(of(null).pipe(delay(1000))), // ignore for 1s
				skipUntil(
					anyToObservable(storage?.getItem(this._restEndpoint)).pipe(
						take(1),
						tap((storedObjects) => {
							if (storedObjects) {
								if (DEBUG) console.log('[smartRestStore](objects$$$) restoring objects from storage', storedObjects);
								Object.entries(storedObjects['pageInfos']).forEach(([key, value]) => {
									this.objectsPageInfos.set(key, value as LightPaginatedResponse<ObjectType>);
								});
								this.objects$$$.next(storedObjects['objects']);
							}
						})
					)
				),
				tap((objects) => {
					this._saveInStorage(objects);
				})
			)
			.subscribe();
	}

	private _initializeClearCacheSubscription() {
		this._requestService.clearCache$
			.pipe(
				takeUntilDestroyed(),
				tap(() => {
					this._clearCache();
				})
			)
			.subscribe();
	}

	private _clearCache() {
		if (DEBUG) console.log('[smartRestStore](clearCache$) clearing cache');

		this.objects$$$.next([]);
		this.objectsPageInfos.clear();
		this.objects$ByIds.clear();
		storage?.clear();
	}
}
