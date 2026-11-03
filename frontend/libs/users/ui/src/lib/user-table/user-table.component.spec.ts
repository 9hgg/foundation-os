import { GenericItemTableComponent } from '@foundation/table/ui';
import { UserTableComponent } from './user-table.component';

describe('UserTableComponent', () => {
	it('is an Angular component class (has ɵcmp metadata)', () => {
		const meta = (UserTableComponent as unknown as { ɵcmp: unknown }).ɵcmp;
		expect(meta).toBeDefined();
	});

	it('has the correct CSS selector lib-user-table', () => {
		const meta = (UserTableComponent as unknown as { ɵcmp: { selectors: string[][] } }).ɵcmp;
		expect(meta.selectors[0][0]).toBe('lib-user-table');
	});

	it('inherits from GenericItemTableComponent, which owns itemsSelector', () => {
		expect(UserTableComponent.prototype instanceof GenericItemTableComponent).toBe(true);
	});

	it('renders defaults for legacy users without config', () => {
		const component = Object.create(UserTableComponent.prototype) as UserTableComponent;
		const legacyUser = { id: 'legacy-user' } as never;

		expect(component.displayLanguage(legacyUser)).toBe('—');
		expect(component.displayTheme(legacyUser)).toBe('system');
	});

	it('renders the configured language and theme', () => {
		const component = Object.create(UserTableComponent.prototype) as UserTableComponent;
		const user = { config: { language: 'fr', theme: { mode: 'dark' } } } as never;

		expect(component.displayLanguage(user)).toBe('fr');
		expect(component.displayTheme(user)).toBe('dark');
	});
});
