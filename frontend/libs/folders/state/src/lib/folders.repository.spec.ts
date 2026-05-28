import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { RequestService } from '@foundation/network/services';
import { NotificationService } from '@foundation/notification';
import { TranslationService } from '@foundation/translations/services';
import { TabManagerService } from '@foundation/utils';
import { NEVER, of } from 'rxjs';
import { FoldersRepository } from './folders.repository';

vi.mock('uuid', () => ({ v4: () => 'folder-id' }));

const routerMock = {
	navigate: vi.fn(),
};

const requestServiceMock = {
	clearCache$: NEVER,
	getBasic$: vi.fn(),
};

const notificationMock = {
	prompt: vi.fn(),
	confirm: vi.fn(),
};

const translationMock = {
	prep: vi.fn((value: string) => () => value),
};

const tabManagerServiceMock = {
	tabId: 'tab-1',
};

describe('folders.repository', () => {
	let repository: FoldersRepository;

	beforeEach(() => {
		vi.clearAllMocks();
		TestBed.configureTestingModule({
			providers: [
				FoldersRepository,
				{ provide: Router, useValue: routerMock },
				{ provide: RequestService, useValue: requestServiceMock },
				{ provide: NotificationService, useValue: notificationMock },
				{ provide: TranslationService, useValue: translationMock },
				{ provide: TabManagerService, useValue: tabManagerServiceMock },
			],
		});
		repository = TestBed.inject(FoldersRepository);
	});

	it('navigates to the files page with the selected folder', () => {
		repository.goToFolder('folder-1');

		expect(routerMock.navigate).toHaveBeenCalledWith(['/', 'host', 'dashboard', 'files'], {
			queryParams: { folderId: 'folder-1' },
			queryParamsHandling: 'merge',
		});
	});

	it('gets the folder for a resource with recursive resource loading', () => {
		requestServiceMock.getBasic$.mockReturnValue(of({ result: { folder: { id: 'folder-1' } } }));

		repository.getFolderFor$('resource-1', 'article').subscribe();

		expect(requestServiceMock.getBasic$).toHaveBeenCalledWith(
			'/api/folders/for/article/resource-1',
			{
				recursive: true,
				includeResources: true,
			},
			{
				silentError: true,
			}
		);
	});

	it('creates a folder from prompt input', async () => {
		notificationMock.prompt.mockReturnValue({ closed: of({ value: 'New folder' }) });
		vi.spyOn(repository.store, 'postObject$').mockReturnValue(of({ result: { data: { id: 'folder-id' } } }));

		await new Promise((resolve) => repository.createNewFolder$('parent-1').subscribe(resolve));

		expect(repository.store.postObject$).toHaveBeenCalledWith({
			id: 'folder-id',
			name: 'New folder',
			parentId: 'parent-1',
		});
	});

	it('does not create a folder when prompt is cancelled', () => {
		notificationMock.prompt.mockReturnValue({ closed: of(null) });
		const postSpy = vi.spyOn(repository.store, 'postObject$');
		let completed = false;

		repository.createNewFolder$().subscribe({ complete: () => (completed = true) });

		expect(completed).toBe(true);
		expect(postSpy).not.toHaveBeenCalled();
	});

	it('renames a folder from prompt input', async () => {
		notificationMock.prompt.mockReturnValue({ closed: of({ value: 'Renamed folder' }) });
		vi.spyOn(repository.store, 'putObject$').mockReturnValue(of({ result: { data: { id: 'folder-1' } } }));

		await new Promise((resolve) => repository.renameFolder({ id: 'folder-1', name: 'Old folder' }).subscribe(resolve));

		expect(repository.store.putObject$).toHaveBeenCalledWith({
			id: 'folder-1',
			name: 'Renamed folder',
		});
	});

	it('does not rename a folder when prompt is empty', () => {
		notificationMock.prompt.mockReturnValue({ closed: of({ value: '' }) });
		const putSpy = vi.spyOn(repository.store, 'putObject$');
		let completed = false;

		repository.renameFolder({ id: 'folder-1', name: 'Old folder' }).subscribe({ complete: () => (completed = true) });

		expect(completed).toBe(true);
		expect(putSpy).not.toHaveBeenCalled();
	});

	it('deletes a folder after confirmation', async () => {
		notificationMock.confirm.mockReturnValue({ closed: of(true) });
		vi.spyOn(repository.store, 'deleteObject$').mockReturnValue(of({}));

		await new Promise((resolve) => repository.deleteFolder({ id: 'folder-1', name: 'Folder' }).subscribe(resolve));

		expect(repository.store.deleteObject$).toHaveBeenCalledWith('folder-1');
	});

	it('does not delete a folder when confirmation is rejected', () => {
		notificationMock.confirm.mockReturnValue({ closed: of(false) });
		const deleteSpy = vi.spyOn(repository.store, 'deleteObject$');
		let completed = false;

		repository.deleteFolder({ id: 'folder-1', name: 'Folder' }).subscribe({ complete: () => (completed = true) });

		expect(completed).toBe(true);
		expect(deleteSpy).not.toHaveBeenCalled();
	});

	it('adds a resource to a folder', () => {
		requestServiceMock.getBasic$.mockReturnValue(of({}));

		repository.addResourceToFolder('folder-1', 'article', 'article-1').subscribe();

		expect(requestServiceMock.getBasic$).toHaveBeenCalledWith('/api/folders/folder-1/add/article/article-1');
	});
});
