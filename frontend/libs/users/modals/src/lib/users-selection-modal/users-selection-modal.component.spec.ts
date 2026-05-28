import { DEFAULT_FILE_SELECTION_MODAL_DATA } from './users-selection-modal.component';

describe('DEFAULT_FILE_SELECTION_MODAL_DATA', () => {
        it('enforces single-user selection (single: true)', () => {
                expect(DEFAULT_FILE_SELECTION_MODAL_DATA.selectionConstraints.single).toBe(true);
        });

        it('requires exactly 1 user (maxUsers = 1)', () => {
                expect(DEFAULT_FILE_SELECTION_MODAL_DATA.selectionConstraints.maxUsers).toBe(1);
        });

        it('requires at least 1 user (minUsers = 1)', () => {
                expect(DEFAULT_FILE_SELECTION_MODAL_DATA.selectionConstraints.minUsers).toBe(1);
        });

        it('selectionConstraints object exists with all three required keys', () => {
                const constraints = DEFAULT_FILE_SELECTION_MODAL_DATA.selectionConstraints;
                expect(constraints).toHaveProperty('single');
                expect(constraints).toHaveProperty('maxUsers');
                expect(constraints).toHaveProperty('minUsers');
	});
});
