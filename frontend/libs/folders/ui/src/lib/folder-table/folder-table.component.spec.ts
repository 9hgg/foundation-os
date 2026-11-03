import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { FoldersRepository } from '@foundation/folders/state';
import { RequestService } from '@foundation/network/services';
import { NotificationService } from '@foundation/notification';
import { TranslationService } from '@foundation/translations/services';
import { DragAndDropService } from '@foundation/utils';
import { EMPTY, of } from 'rxjs';
import { FolderTableComponent } from './folder-table.component';

const ROOT_ONLY_FILTER = { fieldName: 'parent_id', value: '~null', matchType: 'exact' };

describe('FolderTableComponent', () => {
	const buildFixture = () => {
		const renameFolder = vi.fn(() => of({ result: {} }));
		const deleteFolder = vi.fn(() => of({ result: {} }));
		const createNewFolder$ = vi.fn(() => of({ result: {} }));
		const getObjectByIdPullOnce$$$ = vi.fn(() => ({ $: of({ id: 'folder-1', name: 'Photos', parentId: 'folder-0' }) }));
		const getObjectById$$$ = vi.fn(() => ({ $: of({ id: 'folder-0', name: 'Root' }) }));

		TestBed.configureTestingModule({
			providers: [
				{
					provide: FoldersRepository,
					useValue: {
						store: { getObjects$: () => of({ data: [], totalCount: 0, page: 1 }), getObjectByIdPullOnce$$$, getObjectById$$$ },
						renameFolder,
						deleteFolder,
						createNewFolder$,
					},
				},
				{ provide: Router, useValue: { navigate: vi.fn(), events: EMPTY } },
				{ provide: ActivatedRoute, useValue: { queryParams: of({}) } },
				{ provide: RequestService, useValue: { clearCache$: EMPTY } },
				{ provide: NotificationService, useValue: {} },
				{ provide: TranslationService, useValue: { prep: (value: string) => () => value } },
				{ provide: DragAndDropService, useValue: {} },
			],
		});
		TestBed.overrideComponent(FolderTableComponent, { set: { template: '', imports: [], styles: [] } });

		const fixture = TestBed.createComponent(FolderTableComponent);
		fixture.detectChanges();
		const component = fixture.componentInstance;
		const setAlwaysOnFilters = vi.spyOn(component.paginator, 'setAlwaysOnFilters');
		const refresh = vi.spyOn(component.paginator, 'refresh').mockReturnValue(of(null) as never);

		return { fixture, component, renameFolder, deleteFolder, createNewFolder$, setAlwaysOnFilters, refresh, getObjectByIdPullOnce$$$ };
	};

	afterEach(() => TestBed.resetTestingModule());

	it('lists the root folders while no folder is open', () => {
		const { component } = buildFixture();

		expect(component.folderId()).toBeNull();
		expect(component.paginator['_alwaysOnFilters$$$'].value).toEqual([ROOT_ONLY_FILTER]);
	});

	it('lists the children of the folder that is opened', () => {
		const { fixture, component, setAlwaysOnFilters } = buildFixture();

		component.setFolderId('folder-1');
		fixture.detectChanges();

		expect(setAlwaysOnFilters).toHaveBeenCalledWith([{ fieldName: 'parent_id', value: 'folder-1', matchType: 'exact' }]);
	});

	it('goes back to the root folders when the folder is closed', () => {
		const { fixture, component, setAlwaysOnFilters } = buildFixture();
		component.setFolderId('folder-1');
		fixture.detectChanges();

		component.setFolderId(null);
		fixture.detectChanges();

		expect(setAlwaysOnFilters).toHaveBeenLastCalledWith([ROOT_ONLY_FILTER]);
	});

	it('follows the open folder and resolves its parent', () => {
		const { fixture, component, getObjectByIdPullOnce$$$ } = buildFixture();

		component.setFolderId('folder-1');
		fixture.detectChanges();

		expect(getObjectByIdPullOnce$$$).toHaveBeenCalledWith('folder-1');

		let parent: unknown;
		component.parentFolder$.subscribe((value) => (parent = value));
		expect(parent).toMatchObject({ id: 'folder-0' });
	});

	it('has no parent folder while no folder is open', () => {
		const { component } = buildFixture();

		let parent: unknown = 'unset';
		component.parentFolder$.subscribe((value) => (parent = value));
		expect(parent).toBeNull();
	});

	it('clicking a row opens that folder rather than navigating away', () => {
		const { component } = buildFixture();

		component.customFunction({ id: 'folder-2' } as never);

		expect(component.folderId()).toBe('folder-2');
	});

	it('renames through the repository, then refreshes', () => {
		const { component, renameFolder, refresh } = buildFixture();

		component.renameFolder({ id: 'folder-1' } as never);

		expect(renameFolder).toHaveBeenCalledWith({ id: 'folder-1' });
		expect(refresh).toHaveBeenCalled();
	});

	it('deletes through the repository, then refreshes', () => {
		const { component, deleteFolder, refresh } = buildFixture();

		component.deleteFolder({ id: 'folder-1' } as never);

		expect(deleteFolder).toHaveBeenCalledWith({ id: 'folder-1' });
		expect(refresh).toHaveBeenCalled();
	});

	it('creates the new folder inside the one currently open', () => {
		const { fixture, component, createNewFolder$, refresh } = buildFixture();
		component.setFolderId('folder-1');
		fixture.detectChanges();

		component.createNewFolder();

		expect(createNewFolder$).toHaveBeenCalledWith('folder-1');
		expect(refresh).toHaveBeenCalled();
	});

	it('creates at the root when no folder is open', () => {
		const { component, createNewFolder$ } = buildFixture();

		component.createNewFolder();

		expect(createNewFolder$).toHaveBeenCalledWith(null);
	});
});
