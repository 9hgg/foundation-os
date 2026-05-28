import { TestBed } from '@angular/core/testing';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { Component } from '@angular/core';
import { EMPTY } from 'rxjs';
import { FilesRepository } from '@foundation/files/state';
import {
	DEFAULT_FOLDERS_SELECTION_MODAL_DATA,
	FoldersSelectionModalComponent,
	FoldersSelectionModalData,
} from './folders-selection-modal.component';

// Minimal stub for FolderTableComponent (viewChild target)
@Component({
	selector: 'lib-folder-table',
	standalone: true,
	template: '',
})
class FolderTableStub {
	folderId = { set: vi.fn() };
	itemsSelector = {
		_max: 0,
		_min: 0,
		valid: true,
		selectedItems: [{ id: '1', name: 'Test Folder' }],
		numSelected: 1,
		isSelected: vi.fn().mockReturnValue(false),
		toggle: vi.fn(),
		selectMultiple: vi.fn(),
		selectedItems$: EMPTY,
	};
	rootFolder$$$ = { value: null, pipe: vi.fn().mockReturnValue(EMPTY) };
	paginator = {
		setAlwaysOnFilters: vi.fn(),
		itemsOnCurrentPage$$$: { pipe: vi.fn().mockReturnValue(EMPTY) },
	};
}

// Minimal stub for FolderPathComponent
@Component({
	selector: 'lib-folder-path',
	standalone: true,
	template: '',
})
class FolderPathStub {}

describe('folders-selection-modal.component', () => {
	describe('DEFAULT_FOLDERS_SELECTION_MODAL_DATA', () => {
		it('is exported', () => {
			expect(DEFAULT_FOLDERS_SELECTION_MODAL_DATA).toBeDefined();
		});

		it('has single: true', () => {
			expect(DEFAULT_FOLDERS_SELECTION_MODAL_DATA.selectionConstraints.single).toBe(true);
		});

		it('has maxFolders: 1', () => {
			expect(DEFAULT_FOLDERS_SELECTION_MODAL_DATA.selectionConstraints.maxFolders).toBe(1);
		});

		it('has minFolders: 1', () => {
			expect(DEFAULT_FOLDERS_SELECTION_MODAL_DATA.selectionConstraints.minFolders).toBe(1);
		});
	});

	describe('FoldersSelectionModalComponent', () => {
		it('is exported', () => {
			expect(FoldersSelectionModalComponent).toBeDefined();
		});

		it('is a class', () => {
			expect(typeof FoldersSelectionModalComponent).toBe('function');
		});
	});

	describe('FoldersSelectionModalData type', () => {
		it('supports empty data object', () => {
			const data: FoldersSelectionModalData = {};
			expect(data).toBeDefined();
		});

		it('supports selectionConstraints', () => {
			const data: FoldersSelectionModalData = {
				selectionConstraints: { single: true, maxFolders: 5 },
			};
			expect(data.selectionConstraints?.maxFolders).toBe(5);
		});
	});

	describe('FoldersSelectionModalComponent instance', () => {
		function setup(modalData: FoldersSelectionModalData = { selectionConstraints: { single: true, maxFolders: 1, minFolders: 1 } }) {
			const dialogRefMock = {
				close: vi.fn(),
				disableClose: false,
				keydownEvents: EMPTY,
				backdropClick: EMPTY,
			};

			const filesRepositoryMock = {};

			TestBed.configureTestingModule({
				imports: [FoldersSelectionModalComponent],
				providers: [
					{ provide: DIALOG_DATA, useValue: modalData },
					{ provide: DialogRef, useValue: dialogRefMock },
					{ provide: FilesRepository, useValue: filesRepositoryMock },
				],
			}).overrideComponent(FoldersSelectionModalComponent, {
				set: {
					imports: [FolderTableStub, FolderPathStub],
					template: `<lib-folder-table #foldersCmp></lib-folder-table>`,
				},
			});

			const fixture = TestBed.createComponent(FoldersSelectionModalComponent);
			fixture.detectChanges();
			return { fixture, component: fixture.componentInstance, dialogRefMock };
		}

		it('creates', () => {
			const { component } = setup();
			expect(component).toBeTruthy();
		});

		it('sets maxFolders from modal data', () => {
			const { component } = setup({ selectionConstraints: { single: true, maxFolders: 3, minFolders: 1 } });
			expect(component.maxFolders()).toBe(3);
		});

		it('dismiss() calls dialogRef.close()', () => {
			const { component, dialogRefMock } = setup();
			component.dismiss();
			expect(dialogRefMock.close).toHaveBeenCalledWith();
		});

		it('cancel() calls dialogRef.close()', () => {
			const { component, dialogRefMock } = setup();
			component.cancel();
			expect(dialogRefMock.close).toHaveBeenCalled();
		});

		it('close() calls dialogRef.close with result', () => {
			const { component, dialogRefMock } = setup();
			const result = { folders: [] };
			component.close(result);
			expect(dialogRefMock.close).toHaveBeenCalledWith(result);
		});

		it('save() closes dialog when selector is valid', () => {
			const { component, dialogRefMock } = setup();
			// The stub itemsSelector has valid: true
			component.save();
			expect(dialogRefMock.close).toHaveBeenCalled();
		});

		it('trackByFn returns item id', () => {
			const { component } = setup();
			const mockItem = { id: 'abc', name: 'Test' } as any;
			expect(component.trackByFn(0, mockItem)).toBe('abc');
		});

		it('trackByFn returns undefined for null item', () => {
			const { component } = setup();
			expect(component.trackByFn(0, undefined)).toBeUndefined();
		});
	});
});
