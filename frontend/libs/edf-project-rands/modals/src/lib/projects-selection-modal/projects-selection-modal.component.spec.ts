import { DEFAULT_PROJECT_SELECTION_MODAL_DATA, ProjectsSelectionModalComponent } from './projects-selection-modal.component';

describe('projects-selection-modal.component', () => {
	describe('DEFAULT_PROJECT_SELECTION_MODAL_DATA', () => {
		it('is exported', () => {
			expect(DEFAULT_PROJECT_SELECTION_MODAL_DATA).toBeDefined();
		});
	});

	describe('ProjectsSelectionModalComponent', () => {
		it('is exported', () => {
			expect(ProjectsSelectionModalComponent).toBeDefined();
		});
	});
});
