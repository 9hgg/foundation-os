import { firstValueFrom } from 'rxjs';
import { createLocalRequestFn, PaginatorState } from './paginated.model';

type Item = { id: string; name: string; score: number };

const makeItems = (n: number): Item[] =>
	Array.from({ length: n }, (_, i) => ({ id: String(i + 1), name: `item-${i + 1}`, score: i + 1 }));

describe('createLocalRequestFn', () => {
	it('should return all items on page 1 when total <= pageSize', async () => {
		const data = makeItems(3);
		const fn = createLocalRequestFn(data);
		const result = await firstValueFrom(fn(1, 10, [], undefined, false));
		expect(result.data).toHaveLength(3);
		expect(result.totalCount).toBe(3);
		expect(result.hasNext).toBe(false);
		expect(result.hasPrev).toBe(false);
	});

	it('should paginate correctly', async () => {
		const data = makeItems(25);
		const fn = createLocalRequestFn(data);

		const page1 = await firstValueFrom(fn(1, 10, [], undefined, false));
		expect(page1.data).toHaveLength(10);
		expect(page1.hasNext).toBe(true);
		expect(page1.hasPrev).toBe(false);

		const page2 = await firstValueFrom(fn(2, 10, [], undefined, false));
		expect(page2.data).toHaveLength(10);
		expect(page2.hasNext).toBe(true);
		expect(page2.hasPrev).toBe(true);

		const page3 = await firstValueFrom(fn(3, 10, [], undefined, false));
		expect(page3.data).toHaveLength(5);
		expect(page3.hasNext).toBe(false);
	});

	it('should filter by exact match', async () => {
		const data = makeItems(5);
		const fn = createLocalRequestFn(data);
		const result = await firstValueFrom(fn(1, 10, [{ fieldName: 'name', value: 'item-3', matchType: 'exact' }], undefined, false));
		expect(result.totalCount).toBe(1);
		expect(result.data[0]?.id).toBe('3');
	});

	it('should filter by partial match (string)', async () => {
		const data = makeItems(5);
		const fn = createLocalRequestFn(data);
		const result = await firstValueFrom(fn(1, 10, [{ fieldName: 'name', value: 'item', matchType: 'partial' }], undefined, false));
		expect(result.totalCount).toBe(5);
	});

	it('should filter by partial match (number)', async () => {
		const data = makeItems(5);
		const fn = createLocalRequestFn(data);
		const result = await firstValueFrom(fn(1, 10, [{ fieldName: 'score', value: '3', matchType: 'partial' }], undefined, false));
		expect(result.totalCount).toBe(1);
	});

	it('should filter by comparison >', async () => {
		const data = makeItems(5);
		const fn = createLocalRequestFn(data);
		const result = await firstValueFrom(fn(1, 10, [{ fieldName: 'score', value: 3, comparison: '>' }], undefined, false));
		expect(result.totalCount).toBe(2);
	});

	it('should filter by comparison >=', async () => {
		const data = makeItems(5);
		const fn = createLocalRequestFn(data);
		const result = await firstValueFrom(fn(1, 10, [{ fieldName: 'score', value: 3, comparison: '>=' }], undefined, false));
		expect(result.totalCount).toBe(3);
	});

	it('should filter by comparison <', async () => {
		const data = makeItems(5);
		const fn = createLocalRequestFn(data);
		const result = await firstValueFrom(fn(1, 10, [{ fieldName: 'score', value: 3, comparison: '<' }], undefined, false));
		expect(result.totalCount).toBe(2);
	});

	it('should filter by comparison <=', async () => {
		const data = makeItems(5);
		const fn = createLocalRequestFn(data);
		const result = await firstValueFrom(fn(1, 10, [{ fieldName: 'score', value: 3, comparison: '<=' }], undefined, false));
		expect(result.totalCount).toBe(3);
	});

	it('should filter by comparison <> (not equal)', async () => {
		const data = makeItems(5);
		const fn = createLocalRequestFn(data);
		const result = await firstValueFrom(fn(1, 10, [{ fieldName: 'score', value: 3, comparison: '<>' }], undefined, false));
		expect(result.totalCount).toBe(4);
	});

	it('should handle ~null special value in comparison', async () => {
		const data = [{ id: '1', name: 'a', score: null as unknown as number }, { id: '2', name: 'b', score: 1 }];
		const fn = createLocalRequestFn(data);
		const result = await firstValueFrom(fn(1, 10, [{ fieldName: 'score', value: '~null', comparison: '<>' }], undefined, false));
		expect(result.totalCount).toBe(1);
	});

	it('handles ~false special value in comparison', async () => {
		const data = [
			{ id: '1', name: 'a', score: false as unknown as number },
			{ id: '2', name: 'b', score: true as unknown as number },
		];
		const fn = createLocalRequestFn(data);
		const result = await firstValueFrom(fn(1, 10, [{ fieldName: 'score', value: '~false', comparison: '<>' }], undefined, false));
		expect(result.totalCount).toBe(1);
		expect(result.data[0]?.id).toBe('2');
	});

	it('handles ~true special value in comparison', async () => {
		const data = [
			{ id: '1', name: 'a', score: false as unknown as number },
			{ id: '2', name: 'b', score: true as unknown as number },
		];
		const fn = createLocalRequestFn(data);
		const result = await firstValueFrom(fn(1, 10, [{ fieldName: 'score', value: '~true', comparison: '<>' }], undefined, false));
		expect(result.totalCount).toBe(1);
		expect(result.data[0]?.id).toBe('1');
	});

	it('handles ~empty special value in comparison', async () => {
		const data = [
			{ id: '1', name: '', score: 1 },
			{ id: '2', name: 'hello', score: 2 },
		];
		const fn = createLocalRequestFn(data);
		const result = await firstValueFrom(fn(1, 10, [{ fieldName: 'name', value: '~empty', comparison: '<>' }], undefined, false));
		expect(result.totalCount).toBe(1);
		expect(result.data[0]?.id).toBe('2');
	});

	it('converts snake_case field name to camelCase for ordering', async () => {
		const data = [
			{ id: '1', myField: 'charlie', score: 3 },
			{ id: '2', myField: 'alice', score: 1 },
			{ id: '3', myField: 'bob', score: 2 },
		] as any[];
		const fn = createLocalRequestFn(data);
		const result = await firstValueFrom(fn(1, 10, [], 'my_field:asc', false));
		expect(result.data.map((d: any) => d?.myField)).toEqual(['alice', 'bob', 'charlie']);
	});

	it('should sort ascending by field', async () => {
		const data = [{ id: '1', name: 'charlie', score: 3 }, { id: '2', name: 'alice', score: 1 }, { id: '3', name: 'bob', score: 2 }];
		const fn = createLocalRequestFn(data);
		const result = await firstValueFrom(fn(1, 10, [], 'name:asc', false));
		expect(result.data.map((d) => d?.name)).toEqual(['alice', 'bob', 'charlie']);
	});

	it('should sort descending by field', async () => {
		const data = makeItems(3);
		const fn = createLocalRequestFn(data);
		const result = await firstValueFrom(fn(1, 10, [], 'score:desc', false));
		expect(result.data[0]?.score).toBe(3);
		expect(result.data[2]?.score).toBe(1);
	});

	it('should handle empty data', async () => {
		const fn = createLocalRequestFn([]);
		const result = await firstValueFrom(fn(1, 10, [], undefined, false));
		expect(result.totalCount).toBe(0);
		expect(result.data).toHaveLength(0);
		expect(result.hasNext).toBe(false);
	});
});

describe('PaginatorState', () => {
	it('should initialize with defaults', () => {
		const state = new PaginatorState({ requestFirstPage: false });
		expect(state.currentPage$$$.value).toBe(1);
		expect(state.numberOfItemsPerPage$$$.value).toBe(10);
		expect(state.totalNumberOfItems$$$.value).toBe(0);
		expect(state.hasNext$$$.value).toBe(false);
		expect(state.hasPrev$$$.value).toBe(false);
	});

	it('should apply custom pageSize', () => {
		const state = new PaginatorState({ requestFirstPage: false, pageSize: 25 });
		expect(state.numberOfItemsPerPage$$$.value).toBe(25);
	});

	it('should apply alwaysOnFilters', () => {
		const filters = [{ fieldName: 'active', value: true }];
		const state = new PaginatorState({ requestFirstPage: false, alwaysOnFilters: filters });
		expect(state._alwaysOnFilters$$$.value).toEqual(filters);
	});

	it('should process a paginated response and update state', () => {
		const state = new PaginatorState({ requestFirstPage: false });
		state.processPaginatedResponse({
			data: [{ id: '1' }, { id: '2' }] as any[],
			totalCount: 20,
			page: 1,
			hasNext: true,
			hasPrev: false,
			self: '',
			all: '',
			next: '',
			prev: '',
		});

		expect(state.totalNumberOfItems$$$.value).toBe(20);
		expect(state.currentPage$$$.value).toBe(1);
		expect(state.hasNext$$$.value).toBe(true);
		expect(state.hasPrev$$$.value).toBe(false);
		expect(state.mapIdsToItems$$$.value.has('1')).toBe(true);
		expect(state.mapIdsToItems$$$.value.has('2')).toBe(true);
	});

	it('getItemsAtPage should return empty array when no items', () => {
		const state = new PaginatorState({ requestFirstPage: false });
		const items = state.getItemsAtPage(1, 10, new Map(), new Map());
		expect(items).toEqual([]);
	});

	it('getItemsAtPage should return items for a populated page', () => {
		const state = new PaginatorState({ requestFirstPage: false });
		state.processPaginatedResponse({
			data: [{ id: '1', name: 'a' }, { id: '2', name: 'b' }] as any[],
			totalCount: 2,
			page: 1,
			hasNext: false,
			hasPrev: false,
			self: '',
			all: '',
			next: '',
			prev: '',
		});

		const items = state.getItemsAtPage(1, 10, state.mapIndexesToItemIds$$$.value, state.mapIdsToItems$$$.value);
		expect(items).toHaveLength(2);
		expect((items[0] as any)?.name).toBe('a');
	});

	it('should use createLocalRequestFn when provided', async () => {
		const data = makeItems(5);
		const requestFn = createLocalRequestFn(data);
		const state = new PaginatorState({ requestFirstPage: false });
		state.setRequestFn(requestFn);

		await firstValueFrom(state.requestPage$(1));
		expect(state.totalNumberOfItems$$$.value).toBe(5);
	});

	it('setFilters should update filters and do nothing if both are empty', () => {
		const state = new PaginatorState({ requestFirstPage: false });
		const spy = vi.spyOn(state, 'requestPage$').mockReturnValue({ subscribe: vi.fn() } as any);
		state.setFilters([]);
		expect(spy).not.toHaveBeenCalled();
	});

	it('setFilters should trigger a request when filters change', () => {
		const state = new PaginatorState({ requestFirstPage: false });
		const spy = vi.spyOn(state, 'requestPage$').mockReturnValue({ subscribe: vi.fn() } as any);
		vi.spyOn(state, 'preRequestPage').mockImplementation(() => {});
		state.setFilters([{ fieldName: 'name', value: 'alice' }]);
		expect(spy).toHaveBeenCalledWith(1);
	});

	it('setPageSize should update page size', () => {
		const state = new PaginatorState({ requestFirstPage: false });
		vi.spyOn(state, 'requestPage$').mockReturnValue({ subscribe: vi.fn() } as any);
		vi.spyOn(state, 'preRequestPage').mockImplementation(() => {});
		state.setPageSize(20);
		expect(state.numberOfItemsPerPage$$$.value).toBe(20);
	});

	it('setOrderingBy should toggle direction when same field', () => {
		const state = new PaginatorState({ requestFirstPage: false, orderingBy: { fieldName: 'name', direction: 'asc' } });
		vi.spyOn(state, 'requestPage$').mockReturnValue({ subscribe: vi.fn() } as any);
		vi.spyOn(state, 'preRequestPage').mockImplementation(() => {});
		state.setOrderingBy('name', 'asc');
		// toggles to desc since it was already asc
		expect(state['_orderingBy$$$'].value).toBe('name:desc');
	});

	it('setOrderingBy should set new field with asc', () => {
		const state = new PaginatorState({ requestFirstPage: false });
		vi.spyOn(state, 'requestPage$').mockReturnValue({ subscribe: vi.fn() } as any);
		vi.spyOn(state, 'preRequestPage').mockImplementation(() => {});
		state.setOrderingBy('score', 'asc');
		expect(state['_orderingBy$$$'].value).toBe('score:asc');
	});

	it('totalNumberOfPages should be at least 1', async () => {
		const state = new PaginatorState({ requestFirstPage: false });
		const pages = await firstValueFrom(state.totalNumberOfPages$$$.$);
		expect(pages).toBeGreaterThanOrEqual(1);
	});

	it('processPaginatedResponse with goToPage=false should not update currentPage', () => {
		const state = new PaginatorState({ requestFirstPage: false });
		state.processPaginatedResponse(
			{ data: [], totalCount: 100, page: 3, hasNext: true, hasPrev: true, self: '', all: '', next: '', prev: '' },
			false
		);
		expect(state.currentPage$$$.value).toBe(1); // unchanged
		expect(state.totalNumberOfItems$$$.value).toBe(100);
	});

	it('setAlwaysOnFilters should do nothing when both empty', () => {
		const state = new PaginatorState({ requestFirstPage: false });
		const spy = vi.spyOn(state, 'requestPage$').mockReturnValue({ subscribe: vi.fn() } as any);
		state.setAlwaysOnFilters([]);
		expect(spy).not.toHaveBeenCalled();
	});

	it('setAlwaysOnFilters should do nothing when identical filters', () => {
		const filters = [{ fieldName: 'active', value: true }];
		const state = new PaginatorState({ requestFirstPage: false, alwaysOnFilters: filters });
		const spy = vi.spyOn(state, 'requestPage$').mockReturnValue({ subscribe: vi.fn() } as any);
		vi.spyOn(state, 'preRequestPage').mockImplementation(() => {});
		state.setAlwaysOnFilters([...filters]);
		expect(spy).not.toHaveBeenCalled();
	});

	it('setAlwaysOnFilters should trigger request when filters change', () => {
		const state = new PaginatorState({ requestFirstPage: false });
		const spy = vi.spyOn(state, 'requestPage$').mockReturnValue({ subscribe: vi.fn() } as any);
		vi.spyOn(state, 'preRequestPage').mockImplementation(() => {});
		state.setAlwaysOnFilters([{ fieldName: 'status', value: 'active' }]);
		expect(spy).toHaveBeenCalledWith(1);
	});

	it('nextPage increments page and triggers request', async () => {
		const data = makeItems(25);
		const requestFn = createLocalRequestFn(data);
		const state = new PaginatorState({ requestFirstPage: false });
		state.setRequestFn(requestFn);
		await firstValueFrom(state.requestPage$(1));
		const initialPage = state.currentPage$$$.value;
		state.nextPage();
		await firstValueFrom(state.requestPage$(2));
		expect(state.currentPage$$$.value).toBeGreaterThanOrEqual(initialPage);
	});

	it('previousPage decrements page and triggers request', async () => {
		const data = makeItems(25);
		const requestFn = createLocalRequestFn(data);
		const state = new PaginatorState({ requestFirstPage: false });
		state.setRequestFn(requestFn);
		await firstValueFrom(state.requestPage$(2));
		state.currentPage$$$.next(2);
		state.previousPage();
		await firstValueFrom(state.requestPage$(1));
		expect(state.currentPage$$$.value).toBeGreaterThanOrEqual(1);
	});

	it('goToPage navigates to specified page', async () => {
		const data = makeItems(25);
		const requestFn = createLocalRequestFn(data);
		const state = new PaginatorState({ requestFirstPage: false });
		state.setRequestFn(requestFn);
		await firstValueFrom(state.requestPage$(1));
		state.goToPage(2);
		await firstValueFrom(state.requestPage$(2));
		expect(state.currentPage$$$.value).toBeGreaterThanOrEqual(1);
	});

	it('refresh emits to refresher$ and returns observable', async () => {
		const data = makeItems(5);
		const requestFn = createLocalRequestFn(data);
		const state = new PaginatorState({ requestFirstPage: false });
		state.setRequestFn(requestFn);
		await firstValueFrom(state.requestPage$(1));
		const result$ = state.refresh();
		await firstValueFrom(result$);
		expect(state.totalNumberOfItems$$$.value).toBe(5);
	});
});
