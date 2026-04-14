import { Dialog } from '@angular/cdk/dialog';
import { Folder } from '@foundation/folders/models';
import { FoldersRepository } from '@foundation/folders/state';
import { TwFolderIcon } from '@foundation/icons';
import { AccessShareModalComponent } from '@foundation/shared/access';
import { defineExplorerResource, ExplorerResourceDefinition } from '@foundation/shared/explorer';

export function createFolderExplorerResourceDefinition(foldersRepo: FoldersRepository, dialog: Dialog): ExplorerResourceDefinition<Folder> {
	return defineExplorerResource<Folder>({
		kind: 'folder',
		onShare: (r) => dialog.open(AccessShareModalComponent, { data: { resourceId: r.id, resourceKind: 'folder' } }),
		load: (id) => foldersRepo.store.getObjectByIdPullOnce$$$(id).$,
		getName: (r) => r.name || 'Unknown folder',
		iconComponent: TwFolderIcon,
		createAction: {
			label: 'New Folder',
			iconComponent: TwFolderIcon,
			onClick: (folderId) => foldersRepo.createNewFolder$(folderId),
		},
	});
}
