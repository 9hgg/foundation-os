import { Dialog } from '@angular/cdk/dialog';
import { TestBed } from '@angular/core/testing';
import { EntityFile } from '@foundation/files/models';
import { FileModals } from './file.modals';
import { FilesSelectionModalComponent } from './files-selection-modal/files-selection-modal.component';
import { FileDisplayModalComponent } from './file-display-modal/file-display-modal.component';

describe('FileModals', () => {
	let modals: FileModals;
	let dialogMock: { open: ReturnType<typeof vi.fn> };

	beforeEach(() => {
		vi.clearAllMocks();
		dialogMock = { open: vi.fn().mockReturnValue({ closed: { subscribe: vi.fn((cb: (v: unknown) => void) => cb(undefined)) } }) };
		TestBed.configureTestingModule({
			providers: [FileModals, { provide: Dialog, useValue: dialogMock }],
		});
		modals = TestBed.inject(FileModals);
	});

	describe('openFilesSelectionDialog', () => {
		it('opens FilesSelectionModalComponent with the given data', () => {
			const data = { selectionConstraints: { single: true } };

			const ref = modals.openFilesSelectionDialog(data);

			expect(dialogMock.open).toHaveBeenCalledWith(FilesSelectionModalComponent, expect.objectContaining({ data, maxWidth: '1080px' }));
			expect(ref).toBeTruthy();
		});

		it('logs the dialog result once closed', () => {
			const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

			modals.openFilesSelectionDialog({ selectionConstraints: { single: true } });

			expect(logSpy).toHaveBeenCalledWith('The files selection dialog was closed with this result:', undefined);
			logSpy.mockRestore();
		});
	});

	describe('openFileDisplayDialog', () => {
		it('opens FileDisplayModalComponent with the given data', () => {
			const entityFile = { id: 'file-1' } as EntityFile;
			const data = { entityFile };

			const ref = modals.openFileDisplayDialog(data);

			expect(dialogMock.open).toHaveBeenCalledWith(FileDisplayModalComponent, expect.objectContaining({ data, maxWidth: '95%' }));
			expect(ref).toBeTruthy();
		});
	});

	describe('openEntityFileDisplayDialog', () => {
		it('wraps its arguments into FileDisplayModalData and delegates', () => {
			const entityFile = { id: 'file-1' } as EntityFile;
			const files = [entityFile];
			const actions = [{ label: 'Confirm', onClick: vi.fn() }];

			modals.openEntityFileDisplayDialog(entityFile, 'A title', files, actions);

			expect(dialogMock.open).toHaveBeenCalledWith(
				FileDisplayModalComponent,
				expect.objectContaining({ data: { entityFile, title: 'A title', files, actions } })
			);
		});

		it('defaults title/files/actions to undefined when not given', () => {
			const entityFile = { id: 'file-1' } as EntityFile;

			modals.openEntityFileDisplayDialog(entityFile);

			expect(dialogMock.open).toHaveBeenCalledWith(
				FileDisplayModalComponent,
				expect.objectContaining({ data: { entityFile, title: undefined, files: undefined, actions: undefined } })
			);
		});
	});
});
