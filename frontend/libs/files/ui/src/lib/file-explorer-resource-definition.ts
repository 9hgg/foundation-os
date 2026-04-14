import { Dialog } from '@angular/cdk/dialog';
import { EntityFile } from '@foundation/files/models';
import { FilesRepository } from '@foundation/files/state';
import { TwFileIcon, TwUploadIcon } from '@foundation/icons';
import { AccessShareModalComponent } from '@foundation/shared/access';
import { defineExplorerResource, ExplorerResourceDefinition } from '@foundation/shared/explorer';
import { ExplorerFilePreviewComponent } from './explorer-file-preview/explorer-file-preview.component';

export function createFileExplorerResourceDefinition(filesRepo: FilesRepository, dialog: Dialog): ExplorerResourceDefinition<EntityFile> {
	return defineExplorerResource<EntityFile>({
		kind: 'file',
		onShare: (r) => dialog.open(AccessShareModalComponent, { data: { resourceId: r.id, resourceKind: 'file' } }),
		load: (id) => filesRepo.store.getObjectByIdPullOnce$$$(id).$,
		getName: (r) => r.publicFilename || r.originalFilename || 'Unknown file',
		iconComponent: TwFileIcon,
		getTypeBadge: (r) => r.kind || r.extension || null,
		getSize: (r) => r.size ?? null,
		getDate: (r) => {
			const dateStr = r.timeUpdated || r.timeCreated;
			if (!dateStr) return null;
			return new Date(dateStr).toLocaleDateString();
		},
		previewComponent: ExplorerFilePreviewComponent,
		actions: [{ label: 'Download', onClick: () => console.log('Download not implemented'), styleClass: 'btn-ghost' }],
		createAction: {
			label: 'Upload File',
			iconComponent: TwUploadIcon,
			onClick: (folderId) => {
				const input = document.createElement('input');
				input.type = 'file';
				input.multiple = true;
				input.onchange = (event) => {
					const target = event.target;
					if (!(target instanceof HTMLInputElement)) return;

					const files = target.files;
					if (!files || files.length === 0) return;

					filesRepo
						.handleFileList$(files, {
							folder: {
								folderForId: folderId || '',
								folderForKind: 'folder',
								folderPath: '',
							},
						})
						.subscribe();
				};
				input.click();
			},
		},
	});
}
