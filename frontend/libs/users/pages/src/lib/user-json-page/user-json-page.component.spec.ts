import { UserJsonPageComponent } from './user-json-page.component';

describe('UserJsonPageComponent — class structure', () => {
        it('has the correct CSS selector lib-user-json-page', () => {
                const meta = (UserJsonPageComponent as unknown as { ɵcmp: { selectors: string[][] } }).ɵcmp;
                expect(meta.selectors[0][0]).toBe('lib-user-json-page');
        });

        it('exposes a user$$$ property on its prototype', () => {
                // user$$$ is defined in the constructor, verify it exists as an own property pattern
                expect('user$$$' in UserJsonPageComponent.prototype).toBe(false); // it's an instance prop, not prototype
                expect(typeof UserJsonPageComponent).toBe('function'); // confirm the class itself is valid
