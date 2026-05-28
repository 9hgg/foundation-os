import { GenericProfilePageComponent } from './generic-profile-page.component';

describe('GenericProfilePageComponent — class structure', () => {
        it('exposes patchCurrentProfile on its prototype', () => {
                expect(typeof GenericProfilePageComponent.prototype.patchCurrentProfile).toBe('function');
        });

        it('exposes editProfileField on its prototype', () => {
                expect(typeof GenericProfilePageComponent.prototype.editProfileField).toBe('function');
        });

        it('patchCurrentProfile returns early when currentProfile is null (no calls to _requestService)', () => {
                const instance = Object.create(GenericProfilePageComponent.prototype) as GenericProfilePageComponent;
                // Stub repository to return null as current profile
                (instance as unknown as { usersRepository: unknown }).usersRepository = {
                        currentProfile: () => null,
                };
                const requestPost = vi.fn();
                (instance as unknown as { _requestService: unknown })._requestService = { post$: requestPost };
                instance.patchCurrentProfile({ firstName: 'Jane' });
                expect(requestPost).not.toHaveBeenCalled();
