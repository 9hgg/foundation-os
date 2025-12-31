import { PaginatedResponseHoled } from '@foundation/network/services';
import { BehaviorSubjectReplayed, BehaviorSubjectReplayedFromObs, isEqual } from '@foundation/utils';
import { cloneDeep } from 'lodash-es';
import { BehaviorSubject, Observable, Subject, combineLatest, finalize, map, of, shareReplay, startWith, switchMap, tap } from 'rxjs';
import { Filter } from './smartRESTStore.class';

const DEBUG = false;

export type RequestFn<T> = (page: number, pageSize: number, filters: Filter[], orderingBy: string | undefined, forceRequest: boolean) => Observable<PaginatedResponseHoled<T>>;

export interface PaginatorStateOptions<T> {
	requestFn?: RequestFn<T>;
	requestFirstPage?: boolean;
	title?: string;
	pageSize?: number;
	orderingBy?: {
		fieldName: string;
		direction: 'asc' | 'desc';
	};
	alwaysOnFilters?: Filter[];
}

const DefaultPaginatorStateOptions: PaginatorStateOptions<any> = {
	requestFirstPage: true,
	title: undefined,
	pageSize: 10,
	orderingBy: {
		fieldName: 'timeCreated',
		direction: 'asc',
	},
	alwaysOnFilters: [],
};

export class PaginatorState<T extends { id: string; [key: string]: any }> {
	private _title: string | undefined = undefined;

	mapIdsToItems$$$ = new BehaviorSubjectReplayed<Map<string, T | null>>(new Map<string, T>(), this._title ? '[' + this._title + ']' + 'itemsPerId' : undefined);

	mapIndexesToItemIds$$$ = new BehaviorSubjectReplayed<Map<number, string>>(new Map<number, string>(), this._title ? '[' + this._title + ']' + 'itemIdsPerIndex' : undefined);

	currentPage$$$ = new BehaviorSubjectReplayed<number>(1, this._title ? '[' + this._title + ']' + 'currentPageNumber' : undefined);
	hasNext$$$ = new BehaviorSubjectReplayed<boolean>(false, this._title ? '[' + this._title + ']' + 'hasNext' : undefined);
	hasPrev$$$ = new BehaviorSubjectReplayed<boolean>(false, this._title ? '[' + this._title + ']' + 'hasPrev' : undefined);
	totalNumberOfItems$$$ = new BehaviorSubjectReplayed<number>(0, this._title ? '[' + this._title + ']' + 'totalItems' : undefined);
	numberOfItemsPerPage$$$ = new BehaviorSubjectReplayed<number>(10, this._title ? '[' + this._title + ']' + 'itemsPerPage' : undefined);
	totalNumberOfPages$$$ = BehaviorSubjectReplayedFromObs(
		1,
		combineLatest([this.totalNumberOfItems$$$.$, this.numberOfItemsPerPage$$$.$]).pipe(
			map(([totalItems, itemsPerPage]) => {
				return Math.max(1, Math.ceil(totalItems / itemsPerPage));
			})
		),
		this._title ? '[' + this._title + ']' + 'numberOfPages' : undefined
	);

	private _orderingBy$$$ = new BehaviorSubjectReplayed<string | undefined>(undefined, this._title ? '[' + this._title + ']' + 'orderingBy' : undefined);

	private _filters$$$ = new BehaviorSubjectReplayed<Filter[]>([], this._title ? '[' + this._title + ']' + 'filters' : undefined);
	_alwaysOnFilters$$$ = new BehaviorSubjectReplayed<Filter[]>([], this._title ? '[' + this._title + ']' + 'alwaysOnFilters' : undefined);

	itemsOnCurrentPage$$$ = BehaviorSubjectReplayedFromObs(
		[],
		combineLatest([
			//
			this.currentPage$$$.$,
			this.numberOfItemsPerPage$$$.$,
			this.mapIndexesToItemIds$$$.$,
			this.mapIdsToItems$$$.$,
		]).pipe(
			map(([currentPage, numberOfItemsPerPage, mapIndexesToItemIds, mapIdsToItems]) => {
				if (DEBUG)
					console.log('%c[PaginatorState](itemsOnCurrentPage) ', 'color: orange; font-weight: bold', {
						currentPage,
						numberOfItemsPerPage,
						mapIndexesToItemIds,
						mapIdsToItems,
					});

				const a = this.getItemsAtPage(currentPage, numberOfItemsPerPage, mapIndexesToItemIds, mapIdsToItems);
				if (DEBUG) console.log('%c[PaginatorState](itemsOnCurrentPage) ', 'color: orange; font-weight: bold', a);
				return a;
			})
		),
		this._title ? '[' + this._title + ']' + 'itemsOnCurrentPage' : undefined
	);

	refresher$ = new Subject<void>();

	state$ = combineLatest([
		//
		this.mapIndexesToItemIds$$$.$,
		this.mapIdsToItems$$$.$,
		this.currentPage$$$.$,
		this.hasNext$$$.$,
		this.hasPrev$$$.$,
		this.totalNumberOfItems$$$.$,
		this.numberOfItemsPerPage$$$.$,
		this.totalNumberOfPages$$$.$,
		this.itemsOnCurrentPage$$$.$,
		this.refresher$.pipe(startWith(null)),
	]).pipe(
		// throttleTime(50, undefined, { leading: true, trailing: true }),
		map(([mapIndexesToItemIds, mapIdsToItems, currentPage, hasNext, hasPrev, totalNumberOfItems, numberOfItemsPerPage, totalNumberOfPages, itemsOnCurrentPage, _]) => {
			return {
				mapIndexesToItemIds,
				mapIdsToItems,
				currentPage,
				hasNext,
				hasPrev,
				totalNumberOfItems,
				numberOfItemsPerPage,
				totalNumberOfPages,
				itemsOnCurrentPage,
			};
		})
	);

	__requestFn$: RequestFn<T> = () =>
		of({
			data: [],
			totalCount: 0,
			page: 1,
			hasNext: false,
			hasPrev: false,
			self: '',
			all: '',
			next: '',
			prev: '',
		});

	/**
	 *
	 * @param _requestFn a method to fetch the data from the server
	 * @param _options
	 */
	constructor(_options: Partial<PaginatorStateOptions<T>> = DefaultPaginatorStateOptions) {
		const options = { ...DefaultPaginatorStateOptions, ..._options };

		if (options.pageSize) {
			this.numberOfItemsPerPage$$$.next(options.pageSize);
		}

		if (options.orderingBy) {
			this._orderingBy$$$.next(options.orderingBy.fieldName + ':' + options.orderingBy.direction);
		}

		if (options.alwaysOnFilters) {
			this._alwaysOnFilters$$$.next(options.alwaysOnFilters);
		}

		if (options.title) {
			this._title = options.title;
		}

		if (options.requestFn) {
			this.__requestFn$ = options.requestFn;
		}

		if (options.requestFirstPage) {
			this.requestPage$(1).subscribe();
			this.preRequestPage(2);
		}

		if (this._title) if (DEBUG) console.log('%c[PaginatorState](constructor) ', 'color: orange; font-weight: bold', this.numberOfItemsPerPage$$$.value);
	}

	_onGoingRequest: Map<string, BehaviorSubject<Observable<PaginatedResponseHoled<T>>>> = new Map<string, BehaviorSubject<Observable<PaginatedResponseHoled<T>>>>();
	private _requestFn$(page: number, pageSize: number, filters: Filter[], orderingBy: string | undefined, forceRequest: boolean): Observable<PaginatedResponseHoled<T>> {
		// const requestHash = JSON.stringify({
		// 	page,
		// 	pageSize,
		// 	filters,
		// 	orderingBy,
		// 	forceRequest,
		// });
		const requestHash = page + '';
		const onGoingRequest$ = this._onGoingRequest.get(requestHash);
		if (onGoingRequest$) {
			onGoingRequest$.next(this.__requestFn$(page, pageSize, filters, orderingBy, forceRequest));
			return onGoingRequest$.pipe(
				switchMap((r) => r),
				finalize(() => this._onGoingRequest.delete(requestHash))
			);
		}

		const r = this.__requestFn$(page, pageSize, filters, orderingBy, forceRequest);
		const s = new BehaviorSubject(r);
		this._onGoingRequest.set(requestHash, s);
		return s.pipe(
			switchMap((r) => r),
			finalize(() => {
				this._onGoingRequest.delete(requestHash);
			})
		);
	}

	/**
	 * Process a paginated response from the server
	 * and update the item details (total items, current page, url, items in cache)
	 * @param paginatedResponse
	 */
	processPaginatedResponse(paginatedResponse: PaginatedResponseHoled<T>, goToPage: boolean = true) {
		if (DEBUG) console.log('processPaginatedResponse', paginatedResponse);

		// update total items
		this.totalNumberOfItems$$$.next(paginatedResponse.totalCount);

		if (goToPage) {
			// update current page
			this.currentPage$$$.next(paginatedResponse.page);
			// update hasNext
			this.hasNext$$$.next(paginatedResponse.hasNext);
			// update hasPrev
			this.hasPrev$$$.next(paginatedResponse.hasPrev);
		}
		// add results to cache
		const mapIdsToItems = this.mapIdsToItems$$$.value;
		for (const item of paginatedResponse.data) {
			if (item) mapIdsToItems.set(item.id, item);
		}
		this.mapIdsToItems$$$.next(mapIdsToItems);

		// update itemIdsPerIndex
		const mapIndexesToItemIds = this.mapIndexesToItemIds$$$.value;
		const nbItemsInResult = paginatedResponse.data.length;
		for (let i = 0; i < nbItemsInResult; i++) {
			const itemAtI = paginatedResponse.data[i];
			if (itemAtI) mapIndexesToItemIds.set((paginatedResponse.page - 1) * this.numberOfItemsPerPage$$$.value + i, itemAtI.id);
		}

		// remove other items from the index2id map
		for (let i = nbItemsInResult; i < this.numberOfItemsPerPage$$$.value; i++) {
			mapIndexesToItemIds.delete((paginatedResponse.page - 1) * this.numberOfItemsPerPage$$$.value + i);
		}

		this.mapIndexesToItemIds$$$.next(mapIndexesToItemIds);

		if (DEBUG) console.log('%c[PaginatorState](processPaginatedResponse) itemIdsPerIndex', 'color: #00a7e1; font-weight: bold', mapIndexesToItemIds, mapIdsToItems);
	}

	nextPage() {
		const currentPageNumber = this.currentPage$$$.value;
		if (currentPageNumber < this.totalNumberOfPages$$$.value) {
			this.currentPage$$$.next(currentPageNumber + 1);
		}
		this.requestPage$(currentPageNumber + 1).subscribe();

		// pre request following page if available
		if (currentPageNumber + 1 < this.totalNumberOfPages$$$.value) {
			this.preRequestPage(currentPageNumber + 2);
		}
	}

	previousPage() {
		const currentPageNumber = this.currentPage$$$.value;
		if (currentPageNumber > 1) {
			this.currentPage$$$.next(currentPageNumber - 1);
		}
		this.requestPage$(currentPageNumber - 1).subscribe();

		// pre request previous page if available
		if (currentPageNumber - 1 > 1) {
			this.preRequestPage(currentPageNumber - 2);
		}
	}

	/**
	 * Request a page from the server and call processPaginatedResponse
	 * If not provided, the pageNumber and itemsPerPage will be taken from the inner state
	 * @param pageNumber
	 * @param itemsPerPage
	 */
	requestPage$(_pageNumber: number | undefined = undefined, _itemsPerPage: number | undefined = undefined, forceRequest: boolean = false): Observable<PaginatedResponseHoled<T>> {
		const pageNumber = _pageNumber ?? this.currentPage$$$.value;
		const itemsPerPage = _itemsPerPage ?? this.numberOfItemsPerPage$$$.value;
		if (DEBUG)
			console.log('%c[PaginatorState](requestPage$) ', 'color: #00a7e1; font-weight: bold', {
				pageNumber,
				itemsPerPage,
				filters: this._filters$$$.value,
				alwaysOnFilters: this._alwaysOnFilters$$$.value,
				orderingBy: this._orderingBy$$$.value,
				forceRequest,
			});

		// TODO: use a subject to cancel the previous request if it is still pending

		if (DEBUG)
			console.log('requestPage$', {
				pageNumber,
				itemsPerPage,
				filters: this._filters$$$.value,
				alwaysOnFilters: this._alwaysOnFilters$$$.value,
				orderingBy: this._orderingBy$$$.value,
				forceRequest,
			});

		return this._requestFn$(pageNumber, itemsPerPage, [...this._filters$$$.value, ...this._alwaysOnFilters$$$.value], this._orderingBy$$$.value, forceRequest).pipe(
			tap((result) => {
				if (DEBUG) console.log('%c[PaginatorState](requestFn) result', 'color: #00a7e1; font-weight: bold', result, this.__requestFn$.prototype);

				this.processPaginatedResponse(result);
			})
		);
	}

	preRequestPage(_pageNumber: number | undefined = undefined, _itemsPerPage: number | undefined = undefined, forceRequest: boolean = false) {
		const pageNumber = _pageNumber ?? this.currentPage$$$.value;
		const itemsPerPage = _itemsPerPage ?? this.numberOfItemsPerPage$$$.value;
		this._requestFn$(pageNumber, itemsPerPage, [...this._filters$$$.value, ...this._alwaysOnFilters$$$.value], this._orderingBy$$$.value, forceRequest)
			.pipe(
				tap((result) => {
					this.processPaginatedResponse(result, false);
				})
			)
			.subscribe();
	}

	/**
	 * Returns only the cached data (no request can be made from this function)
	 * @param pageNumber
	 * @param numberOfItemsPerPage
	 * @param mapIndexesToItemIds map the index to an "id", one page has multiple indexes hence multiple ids
	 * @param mapIdsToItems map the "id" to an item
	 * @returns
	 */
	getItemsAtPage(pageNumber: number, numberOfItemsPerPage: number, mapIndexesToItemIds: Map<number, string>, mapIdsToItems: Map<string, T | null>): (T | undefined)[] {
		const items: (T | undefined)[] = [];

		const totalNumberOfItems = this.totalNumberOfItems$$$.value;
		const totalNumberOfPages = this.totalNumberOfPages$$$.value;

		if (totalNumberOfItems == 0) {
			return [];
		}

		const lastPage = Math.min(totalNumberOfPages, Math.ceil(totalNumberOfItems / numberOfItemsPerPage));

		const numOnThisPage = pageNumber == lastPage ? (totalNumberOfItems % numberOfItemsPerPage == 0 ? numberOfItemsPerPage : totalNumberOfItems % numberOfItemsPerPage) : numberOfItemsPerPage;

		if (DEBUG)
			console.log('(getItemsAtPage) #itemsOnCurrentPage', {
				numOnThisPage,
				pageNumber,
				lastPage,
				totalNumberOfItems,
				numberOfItemsPerPage,
			});

		// get the items from the cache
		for (let i = (pageNumber - 1) * numberOfItemsPerPage; i < (pageNumber - 1) * numberOfItemsPerPage + numOnThisPage; i++) {
			const itemId = mapIndexesToItemIds.get(i);
			const item = itemId ? mapIdsToItems.get(itemId) : undefined;

			if (item) {
				items.push(item);
			} else {
				items.push({
					id: i + '',
				} as T);
			}
		}
		if (DEBUG)
			console.log('%c[PaginatorState](getItemsAtPage) ', 'color: orange; font-weight: bold', {
				pageNumber,
				numberOfItemsPerPage,
				mapIndexesToItemIds,
				mapIdsToItems,
				items,
			});

		// only copy the result to avoid copying while listing
		return cloneDeep(items);
	}

	/**
	 * Enable sorting order from field name.
	 * @param fieldName
	 * @param direction 'asc' | 'desc': if already sorted by `fieldName`, change the direction
	 */
	public setOrderingBy(fieldName: string, direction: 'asc' | 'desc' = 'asc') {
		if (DEBUG) console.log('%c[PaginatorState](setOrderingBy) ', 'color: #00a7e1; font-weight: bold', 'setting ordering by', fieldName, direction);

		const currentOrdering = this._orderingBy$$$.value;
		if (!currentOrdering) {
			this._orderingBy$$$.next(fieldName + ':' + direction);
		} else {
			const [previousOrderingBy, previousDirection] = currentOrdering.split(':');
			if (previousOrderingBy == fieldName) {
				if (previousDirection == 'asc') {
					this._orderingBy$$$.next(fieldName + ':desc');
				} else {
					this._orderingBy$$$.next(fieldName + ':asc');
				}
			} else {
				this._orderingBy$$$.next(fieldName + ':asc');
			}
		}
		this.requestPage$(1).subscribe();
		this.preRequestPage(2);
	}

	/**
	 * Update the filters for the data
	 * and trigger a request to the server
	 * @param filters
	 */
	public setFilters(filters: Filter[]) {
		if (filters.length === 0 && this._filters$$$.value.length === 0) {
			return;
		}

		if (DEBUG) console.log('%c[PaginatorState](setFilters) ', 'color: #00a7e1; font-weight: bold', 'setting filters', filters);

		this._filters$$$.next(filters.filter((f) => f.value !== ''));
		this.requestPage$(1).subscribe();
		this.preRequestPage(2);
	}

	/**
	 * Update the filters for the data
	 * and trigger a request to the server
	 * @param filters
	 */
	public setAlwaysOnFilters(filters: Filter[]) {
		if (filters.length === 0 && this._alwaysOnFilters$$$.value.length === 0) {
			return;
		}
		if (isEqual(filters, this._alwaysOnFilters$$$.value)) {
			console.log('%c[PaginatorState](setAlwaysOnFilters) ', 'color: #00a7e1; font-weight: bold', 'no change in always on filters', filters);

			return;
		}

		console.log('%c[PaginatorState](setAlwaysOnFilters) ', 'color: #00a7e1; font-weight: bold', 'setting always on filters', filters);
		this._alwaysOnFilters$$$.next(filters.filter((f) => f.value !== ''));
		this.requestPage$(1).subscribe();
		this.preRequestPage(2);
	}

	public setRequestFn(requestFn: RequestFn<T>) {
		if (DEBUG) console.log('%c[PaginatorState](setRequestFn) ', 'color: #00a7e1; font-weight: bold', 'setting request function');

		this.__requestFn$ = requestFn;
		this.requestPage$(1, undefined, true).subscribe();
		this.preRequestPage(2);
	}

	public setPageSize(pageSize: number) {
		if (DEBUG) console.log('%c[PaginatorState](setPageSize) ', 'color: #00a7e1; font-weight: bold', 'setting page size', pageSize);

		this.numberOfItemsPerPage$$$.next(pageSize);
		this.requestPage$(1).subscribe();
		this.preRequestPage(2);
	}

	public refresh() {
		if (DEBUG) console.log('%c[PaginatorState](refresh) ', 'color: #00a7e1; font-weight: bold', 'refreshing current page', this.currentPage$$$.value);

		this.refresher$.next();
		const r = this.requestPage$(undefined, undefined, true).pipe(shareReplay(1));
		r.subscribe();
		return r;
	}

	public goToLastPage() {
		if (DEBUG) console.log('%c[PaginatorState](goToLastPage) ', 'color: #00a7e1; font-weight: bold', 'going to last page', this.totalNumberOfPages$$$.value);

		const lastPageNumber = this.totalNumberOfPages$$$.value;
		this.requestPage$(lastPageNumber, undefined, true).subscribe((d) => {
			// if not last page after request, go to last page
			const newLastPageNumber = this.totalNumberOfPages$$$.value;
			if (newLastPageNumber != lastPageNumber) {
				this.goToLastPage();
			} else {
				this.currentPage$$$.next(lastPageNumber);
			}
		});
	}

	public goToPage(pageNumber: number) {
		if (DEBUG) console.log('%c[PaginatorState](goToPage) ', 'color: #00a7e1; font-weight: bold', 'going to page', pageNumber);

		this.requestPage$(pageNumber, undefined, true).subscribe((d) => {
			this.currentPage$$$.next(pageNumber);
		});
	}
}

export function createLocalRequestFn<T extends { id: string; [key: string]: any }>(localData: (T | null)[]) {
	return function (page: number, pageSize: number, filters: Filter[], orderingBy: string | undefined, forceRequest: boolean): Observable<PaginatedResponseHoled<T>> {
		return new Observable<PaginatedResponseHoled<T>>((observer) => {
			let filteredData = [...localData]; // Copy to avoid mutation

			// Apply filters
			if (filters && filters.length > 0) {
				filters.forEach((filter) => {
					filteredData = filteredData.filter((item) => {
						// convert to camelCase
						const fieldName = filter.fieldName.replace(/([-_][a-z])/gi, ($1) => {
							return $1.toUpperCase().replace('-', '').replace('_', '');
						});

						const value = item ? item[fieldName] : null;

						if (filter.matchType === 'partial') {
							return typeof value === 'string' && value.toLowerCase().includes(filter.value.toLowerCase());
						} else if (filter.comparison) {
							if (filter.value === '~null') {
								filter.value = null;
							} else if (filter.value === '~false') {
								filter.value = false;
							} else if (filter.value === '~true') {
								filter.value = true;
							} else if (filter.value === '~empty') {
								filter.value = '';
							}

							switch (filter.comparison) {
								case '>':
									return value > filter.value;
								case '>=':
									return value >= filter.value;
								case '<':
									return value < filter.value;
								case '<=':
									return value <= filter.value;
								case '<>':
									return value !== filter.value;
								default:
									return false;
							}
						} else {
							return value === filter.value;
						}
					});
				});
			}

			// Apply ordering
			if (orderingBy) {
				const [field_name, direction] = orderingBy.split(':');
				// convert to camelCase
				const fieldName = field_name.replace(/([-_][a-z])/gi, ($1) => {
					return $1.toUpperCase().replace('-', '').replace('_', '');
				});
				filteredData.sort((a, b) => {
					const valueA = a ? a[fieldName] : null;
					const valueB = b ? b[fieldName] : null;
					if (valueA < valueB) return direction === 'asc' ? -1 : 1;
					if (valueA > valueB) return direction === 'asc' ? 1 : -1;
					return 0;
				});
			}

			const totalCount = filteredData.length;
			const totalPages = Math.ceil(totalCount / pageSize);

			// Get data for the requested page
			const paginatedData = filteredData.slice((page - 1) * pageSize, page * pageSize);

			const response: PaginatedResponseHoled<T> = {
				data: paginatedData,
				totalCount: totalCount,
				page: page,
				hasNext: page < totalPages,
				hasPrev: page > 1,
				self: '',
				all: '',
				next: '',
				prev: '',
			};

			if (DEBUG)
				console.log('%c[createLocalRequestFn] ', 'color: #00a7e1; font-weight: bold', {
					response,
				});

			observer.next(response);
			observer.complete();
		});
	};
}
