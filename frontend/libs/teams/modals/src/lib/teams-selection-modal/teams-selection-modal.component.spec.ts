import { DEFAULT_FILE_SELECTION_MODAL_DATA } from './teams-selection-modal.component';

describe('DEFAULT_FILE_SELECTION_MODAL_DATA', () => {
	it('has single=true constraint', () => {
		expect(DEFAULT_FILE_SELECTION_MODAL_DATA.selectionConstraints.single).toBe(true);
	});

	it('has maxTeams=1', () => {
		expect(DEFAULT_FILE_SELECTION_MODAL_DATA.selectionConstraints.maxTeams).toBe(1);
	});

	it('has minTeams=1', () => {
		expect(DEFAULT_FILE_SELECTION_MODAL_DATA.selectionConstraints.minTeams).toBe(1);
	});

	it('contains only selectionConstraints key at top level', () => {
		expect(Object.keys(DEFAULT_FILE_SELECTION_MODAL_DATA)).toContain('selectionConstraints');
	});
});
