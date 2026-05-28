import { UserBuilderPageComponent } from './user-builder-page.component';

describe('UserBuilderPageComponent — static configuration', () => {
        it('defines all five digest frequency options', () => {
                // Access the static property through the prototype — no DI needed
                const instance = Object.create(UserBuilderPageComponent.prototype) as UserBuilderPageComponent;
                expect(instance.digestFrequencies).toEqual(['never', 'hourly', 'daily', 'weekly', 'monthly']);
        });

        it('defines light, dark, and system theme modes in that order', () => {
                const instance = Object.create(UserBuilderPageComponent.prototype) as UserBuilderPageComponent;
                expect(instance.themeModes).toEqual(['system', 'light', 'dark']);
        });

        it('defines exactly five supported languages', () => {
                const instance = Object.create(UserBuilderPageComponent.prototype) as UserBuilderPageComponent;
                expect(instance.languages).toHaveLength(5);
        });

        it('includes English as a supported language', () => {
                const instance = Object.create(UserBuilderPageComponent.prototype) as UserBuilderPageComponent;
                expect(instance.languages.some((l) => l.code === 'en')).toBe(true);
        });

        it('includes French (fr) as a supported language', () => {
                const instance = Object.create(UserBuilderPageComponent.prototype) as UserBuilderPageComponent;
                expect(instance.languages.some((l) => l.code === 'fr')).toBe(true);
