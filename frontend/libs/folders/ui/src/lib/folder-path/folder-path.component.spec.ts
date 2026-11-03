import { TestBed } from '@angular/core/testing';
import { FoldersRepository } from '@foundation/folders/state';
import { of } from 'rxjs';
import { FolderPathComponent } from './folder-path.component';

describe('FolderPathComponent', () => {
	const buildFixture = () => {
		const folders: Record<string, unknown> = {
			'folder-1': { id: 'folder-1', name: 'Photos', parentId: 'folder-0' },
			'folder-0': { id: 'folder-0', name: 'Root' },
		};
		const getObjectByIdPullOnce$$$ = vi.fn((id: string) => ({ $: of(folders[id] ?? null) }));

		TestBed.configureTestingModule({ providers: [{ provide: FoldersRepository, useValue: { store: { getObjectByIdPullOnce$$$ } } }] });
		TestBed.overrideComponent(FolderPathComponent, { set: { template: '', imports: [], styles: [] } });

		const fixture = TestBed.createComponent(FolderPathComponent);
		fixture.detectChanges();

		return { fixture, component: fixture.componentInstance, getObjectByIdPullOnce$$$ };
	};

	afterEach(() => TestBed.resetTestingModule());

	it('shows no folder until one is set', () => {
		const { component } = buildFixture();

		expect(component.folderId()).toBeNull();
		expect(component.rootFolder$$$.value).toBeNull();
	});

	it('resolves the folder it is pointed at', () => {
		const { fixture, component, getObjectByIdPullOnce$$$ } = buildFixture();

		component.setFolderId('folder-1');
		fixture.detectChanges();

		expect(getObjectByIdPullOnce$$$).toHaveBeenCalledWith('folder-1');
		expect(component.rootFolder$$$.value).toMatchObject({ id: 'folder-1' });
	});

	it('resolves the parent so the path can be walked back up', () => {
		const { fixture, component } = buildFixture();
		component.setFolderId('folder-1');
		fixture.detectChanges();

		let parent: unknown;
		component.parentFolder$.subscribe((value) => (parent = value));

		expect(parent).toMatchObject({ id: 'folder-0', name: 'Root' });
	});

	it('has no parent at the root of the path', () => {
		const { fixture, component } = buildFixture();
		component.setFolderId('folder-0');
		fixture.detectChanges();

		let parent: unknown = 'unset';
		component.parentFolder$.subscribe((value) => (parent = value));

		expect(parent).toBeNull();
	});

	it('goes back to nothing when the folder is cleared', () => {
		const { fixture, component } = buildFixture();
		component.setFolderId('folder-1');
		fixture.detectChanges();

		component.setFolderId(null);
		fixture.detectChanges();

		expect(component.rootFolder$$$.value).toBeNull();
	});
});
