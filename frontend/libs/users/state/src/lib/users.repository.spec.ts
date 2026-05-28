import { DEFAULT_USER_PROPS, INITIAL_USERS } from './users.repository';

describe('INITIAL_USERS', () => {
        it('is an empty array', () => {
                expect(INITIAL_USERS).toEqual([]);
        });

        it('is an array type', () => {
                expect(Array.isArray(INITIAL_USERS)).toBe(true);
        });
});

describe('DEFAULT_USER_PROPS', () => {
        it('has currentUser set to null', () => {
                expect(DEFAULT_USER_PROPS.currentUser).toBeNull();
        });

        it('has availableUsers as an empty array', () => {
                expect(DEFAULT_USER_PROPS.availableUsers).toEqual([]);
        });

        it('availableUsers is a separate array reference from INITIAL_USERS', () => {
                expect(DEFAULT_USER_PROPS.availableUsers).not.toBe(INITIAL_USERS);
	});
});
