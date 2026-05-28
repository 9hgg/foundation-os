import { GenericItemTableComponent, PAGINATOR_OPTIONS } from './generic-item-table.component';

describe('PAGINATOR_OPTIONS', () => {
	it('is the injection token string value', () => {
		expect(PAGINATOR_OPTIONS).toBe('PAGINATOR_OPTIONS');
	});
});

describe('GenericItemTableComponent', () => {
	it('has the lib-generic-item-table selector', () => {
		const cmp = GenericItemTableComponent as { ɵcmp?: { selectors: string[][] } };
		const selector = cmp.ɵcmp?.selectors?.[0]?.[0];
		expect(selector).toBe('lib-generic-item-table');
	});

	it('is a class constructor', () => {
		expect(typeof GenericItemTableComponent).toBe('function');
	});

	it('has processClick on the prototype', () => {
		expect(typeof GenericItemTableComponent.prototype.processClick).toBe('function');
	});
});
