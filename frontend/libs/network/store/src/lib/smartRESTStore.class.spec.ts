import { TestBed } from '@angular/core/testing';
import { of, Subject, firstValueFrom } from 'rxjs';
import { RequestService } from '@foundation/network/services';
import { TabManagerService } from '@foundation/utils';
import { SmartRestStore, convertFilterToQueryString, convertQueryStringToFilter, Filter } from './smartRESTStore.class';

type TestObj = { id: string; name: string };

function makeRequestMock() {
	return {
		getObjectList$: vi.fn().mockReturnValue(of({ result: { data: [], total: 0, page: 1, page_size: 10, pages: 1, page_size_used: 10 } })),
		getBasic$: vi.fn().mockReturnValue(of({ result: [] })),
		getObject$: vi.fn().mockReturnValue(of({ result: { data: { id: 'pulled', name: 'pulled' } } })),
		postObject$: vi.fn().mockReturnValue(of({ result: { data: { id: 'new', name: 'new' } } })),
		putObject$: vi.fn().mockReturnValue(of({ result: { data: { id: '1', name: 'updated' } } })),
		patchObject$: vi.fn().mockReturnValue(of({ result: { data: { id: '1', name: 'patched' } } })),
		deleteObject$: vi.fn().mockReturnValue(of({ result: {} })),
		clearCache$: new Subject<void>(),
		clearCache: vi.fn(),
	};
}

function makeStore(requestMock: ReturnType<typeof makeRequestMock>) {
	return TestBed.runInInjectionContext(() => new SmartRestStore<TestObj>('/api/test', 'test', false, false));
}

describe('SmartRestStore', () => {
	let requestMock: ReturnType<typeof makeRequestMock>;
	let store: SmartRestStore<TestObj>;

	beforeEach(() => {
		requestMock = makeRequestMock();

		TestBed.configureTestingModule({
			providers: [
				{ provide: RequestService, useValue: requestMock },
				{ provide: TabManagerService, useValue: { tabId: 'tab-id-1234567890' } },
			],
		});

		store = makeStore(requestMock);
	});

	it('initializes with empty objects list', async () => {
		const objects = await firstValueFrom(store.objects$$$.$);
		expect(objects).toEqual([]);
	});

	describe('upsertObjectLocally', () => {
		it('adds a new object', async () => {
			store.upsertObjectLocally({ id: '1', name: 'Alice' });
			const objects = await firstValueFrom(store.objects$$$.$);
			expect(objects).toHaveLength(1);
			expect(objects[0]).toEqual({ id: '1', name: 'Alice' });
		});

		it('replaces an existing object with same id', async () => {
			store.upsertObjectLocally({ id: '1', name: 'Alice' });
			store.upsertObjectLocally({ id: '1', name: 'Alice Updated' });
			const objects = await firstValueFrom(store.objects$$$.$);
			expect(objects).toHaveLength(1);
			expect(objects[0].name).toBe('Alice Updated');
		});

		it('sorts objects by id after upsert', async () => {
			store.upsertObjectLocally({ id: 'z', name: 'Z' });
			store.upsertObjectLocally({ id: 'a', name: 'A' });
			store.upsertObjectLocally({ id: 'm', name: 'M' });
			const objects = await firstValueFrom(store.objects$$$.$);
			expect(objects.map((o) => o.id)).toEqual(['a', 'm', 'z']);
		});

		it('returns the upserted object', () => {
			const obj = { id: '1', name: 'Test' };
			const result = store.upsertObjectLocally(obj);
			expect(result).toEqual(obj);
		});
	});

	describe('upsertObjects', () => {
		it('adds multiple objects', async () => {
			store.upsertObjects([
				{ id: 'b', name: 'B' },
				{ id: 'a', name: 'A' },
			]);
			const objects = await firstValueFrom(store.objects$$$.$);
			expect(objects).toHaveLength(2);
			expect(objects.map((o) => o.id)).toEqual(['a', 'b']);
		});

		it('replaces existing and adds new', async () => {
			store.upsertObjectLocally({ id: '1', name: 'Old' });
			store.upsertObjects([
				{ id: '1', name: 'New' },
				{ id: '2', name: 'Two' },
			]);
			const objects = await firstValueFrom(store.objects$$$.$);
			expect(objects).toHaveLength(2);
			expect(objects.find((o) => o.id === '1')?.name).toBe('New');
		});

		it('returns the upserted objects array', () => {
			const objs = [{ id: '1', name: 'A' }];
			const result = store.upsertObjects(objs);
			expect(result).toEqual(objs);
		});
	});

	describe('getObjectById$$$', () => {
		it('returns null initially for unknown id', async () => {
			const subject = store.getObjectById$$$('unknown');
			const val = await firstValueFrom(subject.$);
			expect(val).toBeNull();
		});

		it('reflects object after upsert', async () => {
			store.upsertObjectLocally({ id: 'x1', name: 'X' });
			const subject = store.getObjectById$$$('x1');
			const val = await firstValueFrom(subject.$);
			expect(val).toEqual({ id: 'x1', name: 'X' });
		});

		it('returns same subject for same id', () => {
			const s1 = store.getObjectById$$$('id1');
			const s2 = store.getObjectById$$$('id1');
			expect(s1).toBe(s2);
		});

		it('calls pullObject$ when forcePull is true', () => {
			store.getObjectById$$$('x', true);
			expect(requestMock.getObject$).toHaveBeenCalled();
		});
	});

	describe('getObjectByIdPullOnce$$$', () => {
		it('pulls from server when not in store', () => {
			store.getObjectByIdPullOnce$$$('missing');
			expect(requestMock.getObject$).toHaveBeenCalled();
		});

		it('does not pull when already in store', () => {
			store.upsertObjectLocally({ id: 'present', name: 'P' });
			store.getObjectByIdPullOnce$$$('present');
			expect(requestMock.getObject$).not.toHaveBeenCalled();
		});
	});

	describe('deleteObject$', () => {
		it('removes the object from store after delete', async () => {
			store.upsertObjectLocally({ id: 'del1', name: 'Del' });
			store.deleteObject$('del1').subscribe();
			const objects = await firstValueFrom(store.objects$$$.$);
			expect(objects.find((o) => o.id === 'del1')).toBeUndefined();
		});
	});

	describe('cache clearing via clearCache$', () => {
		it('clears objects when clearCache$ emits', async () => {
			store.upsertObjectLocally({ id: '1', name: 'Test' });
			requestMock.clearCache$.next();
			const objects = await firstValueFrom(store.objects$$$.$);
			expect(objects).toEqual([]);
		});

		it('clears objectsPageInfos when clearCache$ emits', () => {
			store.objectsPageInfos.set('key', { dataIds: ['1'], paginatedResponseDetails: {} as any });
			requestMock.clearCache$.next();
			expect(store.objectsPageInfos.size).toBe(0);
		});
	});
});

describe('convertFilterToQueryString', () => {
	it('should convert a basic exact filter', () => {
		const filter: Filter = { fieldName: 'name', value: 'john', matchType: 'exact' };
		expect(convertFilterToQueryString(filter)).toBe('name:john:exact');
	});

	it('should default to exact when matchType is not provided', () => {
		const filter: Filter = { fieldName: 'status', value: 'active' };
		expect(convertFilterToQueryString(filter)).toBe('status:active:exact');
	});

	it('should include comparison when provided', () => {
		const filter: Filter = { fieldName: 'age', value: 30, matchType: 'exact', comparison: '>=' };
		expect(convertFilterToQueryString(filter)).toBe('age:30:exact:>=');
	});

	it('should handle partial matchType', () => {
		const filter: Filter = { fieldName: 'title', value: 'test', matchType: 'partial' };
		expect(convertFilterToQueryString(filter)).toBe('title:test:partial');
	});

	it('should handle all comparison operators', () => {
		(['>', '>=', '<', '<=', '<>'] as Filter['comparison'][]).forEach((op) => {
			const filter: Filter = { fieldName: 'score', value: 10, comparison: op };
			expect(convertFilterToQueryString(filter)).toContain(`:${op}`);
		});
	});
});

describe('convertQueryStringToFilter', () => {
	it('should return null for empty string', () => {
		expect(convertQueryStringToFilter('')).toBeNull();
	});

	it('should return null for invalid query string (less than 2 parts)', () => {
		expect(convertQueryStringToFilter('onlyfield')).toBeNull();
	});

	it('should parse a basic exact filter', () => {
		const result = convertQueryStringToFilter('name:john:exact');
		expect(result).toEqual({ fieldName: 'name', value: 'john', matchType: 'exact' });
	});

	it('should parse a filter without matchType (defaults to exact)', () => {
		const result = convertQueryStringToFilter('status:active');
		expect(result?.fieldName).toBe('status');
		expect(result?.value).toBe('active');
		expect(result?.matchType).toBe('exact');
	});

	it('should parse a filter with comparison operator', () => {
		const result = convertQueryStringToFilter('age:30:exact:>=');
		expect(result).toEqual({ fieldName: 'age', value: '30', matchType: 'exact', comparison: '>=' });
	});

	it('should parse partial matchType', () => {
		const result = convertQueryStringToFilter('title:test:partial');
		expect(result?.matchType).toBe('partial');
	});

	it('should be the inverse of convertFilterToQueryString', () => {
		const original: Filter = { fieldName: 'score', value: '42', matchType: 'exact', comparison: '<>' };
		const qs = convertFilterToQueryString(original);
		const parsed = convertQueryStringToFilter(qs);
		expect(parsed?.fieldName).toBe(original.fieldName);
		expect(parsed?.value).toBe(String(original.value));
		expect(parsed?.matchType).toBe(original.matchType);
		expect(parsed?.comparison).toBe(original.comparison);
	});

	it('should not include comparison when not in query string', () => {
		const result = convertQueryStringToFilter('name:bob:exact');
		expect(result?.comparison).toBeUndefined();
	});
});
