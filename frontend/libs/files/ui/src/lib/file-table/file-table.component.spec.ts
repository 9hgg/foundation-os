import { NO_ERRORS_SCHEMA } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { EntityFile } from '@foundation/files/models';
import { FilesRepository } from '@foundation/files/state';
import { FoldersModals } from '@foundation/folders/modals';
import { RequestService } from '@foundation/network/services';
import { NotificationService } from '@foundation/notification';
import { AccessService } from '@foundation/shared/access';
import { TranslationService } from '@foundation/translations/services';
import { DragAndDropService } from '@foundation/utils';
import { of, throwError } from 'rxjs';
import { FileTableComponent } from './file-table.component';

const emptyPage = { data: [], totalCount: 0, page: 1, hasNext: false, hasPrev: false, self: '', all: '', next: '', prev: '' };
const file: EntityFile = { id: 'file-1', name: 'report.pdf', inStorage: true, extra: {}, config: {} };

describe('FileTableComponent', () => {
	let component: FileTableComponent;
	let filesRepository: {
		store: {
			getObjects$: ReturnType<typeof vi.fn>;
			getObjectById$$$: ReturnType<typeof vi.fn>;
		};
		renameFile: ReturnType<typeof vi.fn>;
		deleteFile: ReturnType<typeof vi.fn>;
		updateAfterUpload$: ReturnType<typeof vi.fn>;
	};
	let foldersModals: { openFolderSelectionDialog: ReturnType<typeof vi.fn> };
	let requestService: { clearCache$: ReturnType<typeof vi.fn>; getBasic$: ReturnType<typeof vi.fn> };
	let notificationService: { notify: ReturnType<typeof vi.fn>; error: ReturnType<typeof vi.fn> };
	let accessService: { shareWithTeam: ReturnType<typeof vi.fn>; openSharingDetails: ReturnType<typeof vi.fn> };

	beforeEach(async () => {
		filesRepository = {
			store: {
				getObjects$: vi.fn().mockReturnValue(of(emptyPage)),
				getObjectById$$$: vi.fn().mockReturnValue({ $: of(null) }),
			},
			renameFile: vi.fn().mockReturnValue(of({})),
			deleteFile: vi.fn().mockReturnValue(of({})),
			updateAfterUpload$: vi.fn().mockReturnValue(of(file)),
		};
		foldersModals = { openFolderSelectionDialog: vi.fn().mockReturnValue({ closed: of({ folders: [] }) }) };
		requestService = { clearCache$: vi.fn(), getBasic$: vi.fn().mockReturnValue(of({})) };
		notificationService = { notify: vi.fn(), error: vi.fn() };
		accessService = { shareWithTeam: vi.fn(), openSharingDetails: vi.fn() };

		await TestBed.configureTestingModule({
			imports: [FileTableComponent],
			providers: [
				{ provide: FilesRepository, useValue: filesRepository },
				{ provide: FoldersModals, useValue: foldersModals },
				{ provide: RequestService, useValue: requestService },
				{ provide: NotificationService, useValue: notificationService },
				{ provide: AccessService, useValue: accessService },
				{ provide: TranslationService, useValue: { prep: vi.fn((value: string) => () => value), instant: vi.fn(), translate$: vi.fn().mockReturnValue(of('translated')) } },
				{ provide: Router, useValue: { navigate: vi.fn() } },
				{ provide: ActivatedRoute, useValue: { queryParams: of({}), snapshot: { queryParams: {} } } },
				{ provide: DragAndDropService, useValue: {} },
			],
			schemas: [NO_ERRORS_SCHEMA],
		})
			.overrideComponent(FileTableComponent, { set: { imports: [], template: '' } })
			.compileComponents();

		component = TestBed.createComponent(FileTableComponent).componentInstance;
	});

	it('toggles shift state', () => {
		component.onShiftDown();
		expect(component.shiftPressed()).toBe(true);
		component.onShiftUp();
		expect(component.shiftPressed()).toBe(false);
	});

	it('renames and deletes files then refreshes the paginator', () => {
		const refreshSpy = vi.spyOn(component.paginator, 'refresh').mockReturnValue(of(emptyPage));

		component.renameFile(file);
		component.deleteFile(file);

		expect(filesRepository.renameFile).toHaveBeenCalledWith(file);
		expect(filesRepository.deleteFile).toHaveBeenCalledWith(file);
		expect(refreshSpy).toHaveBeenCalledTimes(2);
	});

	it('adds a file to selected folders', () => {
		foldersModals.openFolderSelectionDialog.mockReturnValue({ closed: of({ folders: [{ id: 'folder-1' }, { id: 'folder-2' }] }) });

		component.addToFolder(file);

		expect(foldersModals.openFolderSelectionDialog).toHaveBeenCalledWith({
			selectionConstraints: { single: false, minFolders: 1, maxFolders: 10 },
		});
		expect(requestService.getBasic$).toHaveBeenCalledWith('/api/folders/folder-1/add/file/file-1');
		expect(requestService.getBasic$).toHaveBeenCalledWith('/api/folders/folder-2/add/file/file-1');
	});

	it('removes a file from the current folder and retriggers the folder model', () => {
		component.folderId.set('folder-1');

		component.removeFromFolder('folder-1', file);

		expect(requestService.getBasic$).toHaveBeenCalledWith('/api/folders/folder-1/remove/file/file-1');
		expect(component.folderId()).toBe('folder-1');
	});

	it('displays file details', () => {
		component.displayFileDetails(file);

		expect(notificationService.notify).toHaveBeenCalledWith(expect.stringContaining('"id": "file-1"'), 'File details');
	});

	it('refreshes thumbnails and handles refresh errors', () => {
		const refreshSpy = vi.spyOn(component.paginator, 'refresh').mockReturnValue(of(emptyPage));

		component.refreshThumbnail(file);
		filesRepository.updateAfterUpload$.mockReturnValue(throwError(() => new Error('nope')));
		component.refreshThumbnail(file);

		expect(filesRepository.updateAfterUpload$).toHaveBeenCalledWith('file-1', true);
		expect(refreshSpy).toHaveBeenCalled();
		expect(notificationService.error).toHaveBeenCalledWith('Failed to refresh thumbnail: nope');
	});

	it('delegates sharing actions to access service', () => {
		component.shareWithTeam(file);
		component.openSharingDetails(file);

		expect(accessService.shareWithTeam).toHaveBeenCalledWith('file-1', 'file');
		expect(accessService.openSharingDetails).toHaveBeenCalledWith('file-1', 'file');
	});
});
