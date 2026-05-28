import { ITEM_REPOSITORY, RepositoryTableComponent } from './item-table.component';

describe('ITEM_REPOSITORY', () => {
	it('is the injection token string value', () => {
		expect(ITEM_REPOSITORY).toBe('ITEM_REPOSITORY');
	});
});

describe('RepositoryTableComponent', () => {
	it('has the lib-item-table selector', () => {
		const cmp = RepositoryTableComponent as { ɵcmp?: { selectors: string[][] } };
		const selector = cmp.ɵcmp?.selectors?.[0]?.[0];
		expect(selector).toBe('lib-item-table');
	});

	it('is a class constructor', () => {
		expect(typeof RepositoryTableComponent).toBe('function');
	});
});
