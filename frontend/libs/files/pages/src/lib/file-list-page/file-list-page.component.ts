import { EntityFile } from '@foundation/files/models';
import { FilesRepository } from '@foundation/files/state';
import { FileTableComponent, UploadButtonComponent } from '@foundation/files/ui';
import { FoldersRepository } from '@foundation/folders/state';
import { FolderPathComponent, FolderTableComponent } from '@foundation/folders/ui';
import { TwUploadIcon } from '@foundation/icons';
import { RequestService } from '@foundation/network/services';
import { TranslateDirective } from '@foundation/translations/services';

import { ChangeDetectionStrategy, Component, effect, inject, model, viewChild } from '@angular/core';
import { Router } from '@angular/router';
import { combineLatest, of, switchMap, tap } from 'rxjs';

const DEBUG = true;

@Component({
	selector: 'lib-file-list-page',
	standalone: true,
	imports: [FolderTableComponent, FileTableComponent, TranslateDirective, TwUploadIcon, UploadButtonComponent, FolderPathComponent],
	templateUrl: './file-list-page.component.html',
	styleUrl: './file-list-page.component.css',
	changeDetection: ChangeDetectionStrategy.OnPush,
	host: {
		class: 'dashboard-page-host',
	},
})
export class FileListPageComponent {
	private _requestService = inject(RequestService);
	private _filesRepository = inject(FilesRepository);
	private _foldersRepository = inject(FoldersRepository);
	private _router = inject(Router);

	// folderId from the URL
	folderId = model<string | null>(null);
	// fileSearchPattern from the URL
	fileSearchPattern = model<string | null>(null);

	/** Explicit list of files (may come from input or a selected folder) */
	// files = model<(EntityFile | null)[]>([]);
	fileTable = viewChild.required(FileTableComponent);
	folderTable = viewChild.required(FolderTableComponent);

	constructor() {
		// reacts to folderId changes and fetches files to explicitly display in the file table
		// bonus: keep in sync the URL parameter folderId and
		effect(() => {
			const folderId = this.folderId();
			const fileTable = this.fileTable();
			if (DEBUG) console.log('(Effect from folderId)', { folderId });

			this._router.navigate([], {
				queryParams: { folderId },
				queryParamsHandling: 'merge',
				preserveFragment: true,
			});

			if (folderId && fileTable) {
				this._loadFolderFiles$(folderId, fileTable).subscribe();
			} else {
				// Deliberate: with no folder selected the table falls back to its paginated repository
				// request, which lists every readable file — foldered ones included, so a file shows up
				// both here and inside its folder. This is the wanted "all files" view, not an oversight.
				fileTable.explicitItems.set(null);
			}
		});

		effect(() => {
			const fileSearchPattern = this.fileSearchPattern();
			if (DEBUG) console.log('(Effect from fileSearchPattern)', { fileSearchPattern });
		});
	}

	private _loadFolderFiles$(folderId: string, fileTable: FileTableComponent) {
		return this._requestService
			.getBasic$<{
				folderId: string;
				subfolders: { id: string; name: string; parent_id: string }[];
				subfoldersAndResources: {
					id: string;
					name?: string;
					for_id: null | string;
					for_kind: null | string;
					children: { id: string; name: string }[];
					resources: { id: string; kind: string }[];
				}[];
			}>('/api/folders/' + folderId + '/subfolders', undefined, {
				// extraHeaders: { toCache: '' + 5 * 60 * 1000 }, // 5mn
			})
			.pipe(
				switchMap((response) => {
					if (DEBUG) console.log('(Effect from folderId) response', { response });

					if (!response.result) {
						return of([]);
					}
					// The endpoint returns the whole descendant subtree, and its query carries no
					// ORDER BY: the requested folder can come back at any index, not the first one.
					const currentFolder = response.result.subfoldersAndResources.find((subfolder) => subfolder.id === folderId);
					if (!currentFolder) {
						return of([]);
					}
					const files = (currentFolder.resources ?? []).filter((r) => r.kind == 'file');
					if (files.length === 0) {
						return of([]);
					}
					return combineLatest(files.map((fileDetails) => this._filesRepository.store.getObjectByIdPullOnce$$$(fileDetails.id).$));
				}),
				tap((files) => {
					if (DEBUG) console.log('(Effect from folderId) files', { files });
					fileTable.explicitItems.set(files);
				})
			);
	}

	processUploadedFiles(files: (EntityFile | undefined)[]) {
		const fileTable = this.fileTable();
		if (!fileTable) return;

		// Inside a folder the table is fed an explicit list, which a paginator refresh would rebuild
		// from the same stale items: the folder has to be read again for the new files to show up.
		const folderId = this.folderId();
		if (folderId) {
			this._loadFolderFiles$(folderId, fileTable).subscribe();
			return;
		}
		fileTable.paginator.refresh();
	}

	public createNewFolder() {
		this._foldersRepository
			.createNewFolder$(this.folderId())
			.pipe(switchMap(() => this.folderTable().paginator.refresh()))
			.subscribe();
	}
}
