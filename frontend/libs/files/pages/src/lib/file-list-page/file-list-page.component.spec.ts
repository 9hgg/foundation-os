import { Component, forwardRef, model } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { EntityFile } from '@foundation/files/models';
import { FilesRepository } from '@foundation/files/state';
import { FileTableComponent } from '@foundation/files/ui';
import { FoldersRepository } from '@foundation/folders/state';
import { FolderTableComponent } from '@foundation/folders/ui';
import { RequestService } from '@foundation/network/services';
import { of } from 'rxjs';
import { FileListPageComponent } from './file-list-page.component';

@Component({
	selector: 'lib-file-table',
	standalone: true,
	template: '',
	providers: [{ provide: FileTableComponent, useExisting: forwardRef(() => StubFileTableComponent) }],
})
class StubFileTableComponent {
	explicitItems = model<(EntityFile | null)[] | null>(null);
	paginator = { refresh: vi.fn().mockReturnValue(of({})) };
}

@Component({
	selector: 'lib-folder-table',
	standalone: true,
	template: '',
	providers: [{ provide: FolderTableComponent, useExisting: forwardRef(() => StubFolderTableComponent) }],
})
class StubFolderTableComponent {
	paginator = { refresh: vi.fn().mockReturnValue(of({})) };
}

const file: EntityFile = { id: 'file-1', name: 'report.pdf', config: {} };

describe('FileListPageComponent', () => {
	let fixture: ReturnType<typeof TestBed.createComponent<FileListPageComponent>>;
	let component: FileListPageComponent;
	let requestService: {
		getBasic$: ReturnType<typeof vi.fn>;
	};
	let filesRepository: {
		store: {
			getObjectByIdPullOnce$$$: ReturnType<typeof vi.fn>;
		};
	};
	let foldersRepository: {
		createNewFolder$: ReturnType<typeof vi.fn>;
	};
	let router: {
		navigate: ReturnType<typeof vi.fn>;
	};

	beforeEach(async () => {
		requestService = {
			getBasic$: vi.fn().mockReturnValue(of({ result: null })),
		};
		filesRepository = {
			store: {
				getObjectByIdPullOnce$$$: vi.fn().mockReturnValue({ $: of(file) }),
			},
		};
		foldersRepository = {
			createNewFolder$: vi.fn().mockReturnValue(of({})),
		};
		router = {
			navigate: vi.fn(),
		};

		await TestBed.configureTestingModule({
			imports: [FileListPageComponent],
			providers: [
				{ provide: RequestService, useValue: requestService },
				{ provide: FilesRepository, useValue: filesRepository },
				{ provide: FoldersRepository, useValue: foldersRepository },
				{ provide: Router, useValue: router },
			],
		})
			.overrideComponent(FileListPageComponent, {
				set: {
					imports: [StubFileTableComponent, StubFolderTableComponent],
					template: '<lib-file-table /><lib-folder-table />',
				},
			})
			.compileComponents();

		fixture = TestBed.createComponent(FileListPageComponent);
		component = fixture.componentInstance;
		fixture.detectChanges();
	});

	it('creates and clears explicit files when no folder is selected', () => {
		expect(component).toBeTruthy();
		expect(component.fileTable().explicitItems()).toBeNull();
		expect(router.navigate).toHaveBeenCalledWith([], {
			queryParams: { folderId: null },
			queryParamsHandling: 'merge',
			preserveFragment: true,
		});
	});

	it('loads file resources for the selected folder', () => {
		requestService.getBasic$.mockReturnValue(
			of({
				result: {
					folderId: 'folder-1',
					subfolders: [],
					subfoldersAndResources: [
						{
							id: 'folder-1',
							for_id: null,
							for_kind: null,
							children: [],
							resources: [
								{ id: 'file-1', kind: 'file' },
								{ id: 'team-1', kind: 'team' },
							],
						},
					],
				},
			})
		);

		component.folderId.set('folder-1');
		fixture.detectChanges();

		expect(router.navigate).toHaveBeenCalledWith([], {
			queryParams: { folderId: 'folder-1' },
			queryParamsHandling: 'merge',
			preserveFragment: true,
		});
		expect(requestService.getBasic$).toHaveBeenCalledWith('/api/folders/folder-1/subfolders', undefined, {});
		expect(filesRepository.store.getObjectByIdPullOnce$$$).toHaveBeenCalledWith('file-1');
		expect(component.fileTable().explicitItems()).toEqual([file]);
	});

	it('sets an empty explicit list when the folder has no file resources', () => {
		requestService.getBasic$.mockReturnValue(
			of({
				result: {
					folderId: 'folder-1',
					subfolders: [],
					subfoldersAndResources: [
						{
							id: 'folder-1',
							for_id: null,
							for_kind: null,
							children: [],
							resources: [{ id: 'team-1', kind: 'team' }],
						},
					],
				},
			})
		);

		component.folderId.set('folder-1');
		fixture.detectChanges();

		expect(component.fileTable().explicitItems()).toEqual([]);
	});

	it('refreshes the file table after uploads', () => {
		component.processUploadedFiles([file]);

		expect(component.fileTable().paginator.refresh).toHaveBeenCalled();
	});

	it('creates a new folder under the current folder and refreshes the folder table', () => {
		component.folderId.set('parent-folder');
		fixture.detectChanges();

		component.createNewFolder();

		expect(foldersRepository.createNewFolder$).toHaveBeenCalledWith('parent-folder');
		expect(component.folderTable().paginator.refresh).toHaveBeenCalled();
	});
});
