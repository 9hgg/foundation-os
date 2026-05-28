import { TestBed } from '@angular/core/testing';
import { Dialog } from '@angular/cdk/dialog';
import { of } from 'rxjs';
import { FoldersModals } from './folder.modals';

describe('folder.modals', () => {
	describe('FoldersModals', () => {
		it('is exported', () => {
			expect(FoldersModals).toBeDefined();
		});

		function setup() {
			const dialogRefMock = {
				closed: of(undefined),
				close: vi.fn(),
			};
			const dialogMock = {
				open: vi.fn().mockReturnValue(dialogRefMock),
			};

			TestBed.configureTestingModule({
				providers: [
					FoldersModals,
					{ provide: Dialog, useValue: dialogMock },
				],
			});

			const service = TestBed.inject(FoldersModals);
			return { service, dialogMock, dialogRefMock };
		}

		it('can be instantiated', () => {
			const { service } = setup();
			expect(service).toBeTruthy();
		});

		it('openFolderSelectionDialog opens dialog and returns dialogRef', () => {
			const { service, dialogMock, dialogRefMock } = setup();
			const result = service.openFolderSelectionDialog();
			expect(dialogMock.open).toHaveBeenCalledOnce();
			expect(result).toBe(dialogRefMock);
		});

		it('openFolderSelectionDialog passes custom data to dialog', () => {
			const { service, dialogMock } = setup();
			const customData = {
				selectionConstraints: { single: false, maxFolders: 3, minFolders: 1 },
			};
			service.openFolderSelectionDialog(customData);
			const callArgs = dialogMock.open.mock.calls[0][1];
			expect(callArgs.data).toEqual(customData);
		});

		it('openFolderSelectionDialog uses default constraints when called with no args', () => {
			const { service, dialogMock } = setup();
			service.openFolderSelectionDialog();
			const callArgs = dialogMock.open.mock.calls[0][1];
			expect(callArgs.data.selectionConstraints).toEqual({
				single: true,
				maxFolders: 1,
				minFolders: 1,
			});
		});
	});
});
