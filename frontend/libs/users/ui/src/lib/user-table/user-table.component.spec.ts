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

        it('exposes itemsSelector property on its prototype chain', () => {
                // Inherited from GenericItemTableComponent — ensures the component hasn't dropped it
                expect('itemsSelector' in UserTableComponent.prototype).toBe(true);
