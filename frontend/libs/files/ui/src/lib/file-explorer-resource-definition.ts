import { Dialog } from '@angular/cdk/dialog';
import { EntityFile } from '@foundation/files/models';
import { FilesRepository } from '@foundation/files/state';
import { FoldersRepository } from '@foundation/folders/state';
import { TwFileIcon, TwUploadIcon } from '@foundation/icons';
import { AccessShareModalComponent } from '@foundation/shared/access';
import { defineExplorerResource, ExplorerResourceDefinition } from '@foundation/shared/explorer';
import { Observable } from 'rxjs';
import { ExplorerFilePreviewComponent } from './explorer-file-preview/explorer-file-preview.component';

export function createFileExplorerResourceDefinition(filesRepo: FilesRepository, foldersRepo: FoldersRepository, dialog: Dialog): ExplorerResourceDefinition<EntityFile> {
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
			// The explorer refetches the folder when this observable emits, so the upload has to be
			// reported through it: picking files is asynchronous, and returning void here left the
			// uploaded file invisible until a manual reload.
			onClick: (folderId) =>
				new Observable<void>((subscriber) => {
					const input = document.createElement('input');
					input.type = 'file';
					input.multiple = true;
					input.oncancel = () => subscriber.complete();
					input.onchange = (event) => {
						const target = event.target;
						if (!(target instanceof HTMLInputElement)) {
							subscriber.complete();
							return;
						}

						const files = target.files;
						if (!files || files.length === 0) {
							subscriber.complete();
							return;
						}

						filesRepo
							.handleFileList$(files, {
								folderId: folderId ?? undefined,
							})
							.subscribe({
								next: () => subscriber.next(),
								error: (error) => subscriber.error(error),
								complete: () => {
									// The explorer root renders folders only, never files, so an upload there
									// would look like nothing happened. The file list page does show them.
									if (!folderId) foldersRepo.goToFolder(null);
									subscriber.complete();
								},
							});
					};
					input.click();
				}),
		},
	});
}
