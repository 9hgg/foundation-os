import { UserModals } from './user.modals';

describe('UserModals', () => {
        it('is a class (function)', () => {
                expect(typeof UserModals).toBe('function');
        });

        it('exposes an openUsersSelectionDialog method on its prototype', () => {
                expect(typeof UserModals.prototype.openUsersSelectionDialog).toBe('function');
