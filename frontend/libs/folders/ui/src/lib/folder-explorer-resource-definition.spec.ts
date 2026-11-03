import { TwFolderIcon } from '@foundation/icons';
import { of } from 'rxjs';
import { createFolderExplorerResourceDefinition } from './folder-explorer-resource-definition';

describe('createFolderExplorerResourceDefinition', () => {
	const buildDefinition = () => {
		const open = vi.fn();
		const getObjectByIdPullOnce$$$ = vi.fn(() => ({ $: of({ id: 'folder-1', name: 'Photos' }) }));
		const createNewFolder$ = vi.fn(() => of({ result: {} }));

		const definition = createFolderExplorerResourceDefinition({ store: { getObjectByIdPullOnce$$$ }, createNewFolder$ } as never, { open } as never);

		return { definition, open, getObjectByIdPullOnce$$$, createNewFolder$ };
	};

	it('declares the folder kind with its icon', () => {
		const { definition } = buildDefinition();

		expect(definition.kind).toBe('folder');
		expect(definition.iconComponent).toBe(TwFolderIcon);
	});

	it('loads a folder through the repository', () => {
		const { definition, getObjectByIdPullOnce$$$ } = buildDefinition();

		definition.load('folder-1').subscribe();

		expect(getObjectByIdPullOnce$$$).toHaveBeenCalledWith('folder-1');
	});

	it('names a folder, and names an unnamed one', () => {
		const { definition } = buildDefinition();

		expect(definition.getName({ id: 'folder-1', name: 'Photos' } as never)).toBe('Photos');
		expect(definition.getName({ id: 'folder-1', name: '' } as never)).toBe('Unknown folder');
	});

	it('shares through the access modal, scoped to the folder', () => {
		const { definition, open } = buildDefinition();

		definition.onShare({ id: 'folder-1' } as never);

		// Naming the share modal here would import @foundation/shared/access, which imports back into
		// folders-ui through the team table -- a cycle the module-boundary rule rejects.
		expect(open).toHaveBeenCalledWith(expect.any(Function), { data: { resourceId: 'folder-1', resourceKind: 'folder' } });
	});

	it('creates the new folder inside the one being browsed, and at the root otherwise', () => {
		const { definition, createNewFolder$ } = buildDefinition();

		definition.createAction?.onClick('folder-1');
		expect(createNewFolder$).toHaveBeenCalledWith('folder-1');

		definition.createAction?.onClick(null);
		expect(createNewFolder$).toHaveBeenCalledWith(null);
	});
});
