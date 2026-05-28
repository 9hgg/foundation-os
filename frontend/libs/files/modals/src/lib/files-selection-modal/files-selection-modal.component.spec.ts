import { DEFAULT_FILE_SELECTION_MODAL_DATA, FilesSelectionModalComponent } from './files-selection-modal.component';

describe('files-selection-modal.component', () => {
	describe('DEFAULT_FILE_SELECTION_MODAL_DATA', () => {
		it('is exported', () => {
			expect(DEFAULT_FILE_SELECTION_MODAL_DATA).toBeDefined();
		});
	});

	describe('FilesSelectionModalComponent', () => {
		it('is exported', () => {
			expect(FilesSelectionModalComponent).toBeDefined();
		});
	});
});
