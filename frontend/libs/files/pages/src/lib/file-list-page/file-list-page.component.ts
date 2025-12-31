import { EntityFile } from '@foundation/files/models';
import { FilesRepository } from '@foundation/files/state';
import { FileTableComponent, UploadButtonComponent } from '@foundation/files/ui';
import { FoldersRepository } from '@foundation/folders/state';
import { FolderPathComponent, FolderTableComponent } from '@foundation/folders/ui';
import { TranslationsRepository } from '@foundation/translations/state';
import { TranslationService } from '@foundation/translations/services';
import { TranslationTableComponent } from '@foundation/translations/ui';
import { TranslatePipe, TranslateDirective } from '@foundation/translations/services';
import { TwUploadIcon } from '@foundation/icons';
import { RequestService } from '@foundation/network/services';

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
				// this.files.set([]);
				this._requestService
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
							if (response.result.subfoldersAndResources.length === 0) {
								return of([]);
							}
							if (response.result.subfoldersAndResources[0].resources.length === 0) {
								return of([]);
							}
							// first subfolder is the folder itself with its resources and subfolders
							const files = response.result.subfoldersAndResources[0].resources.filter((r) => r.kind == 'file');
							if (files.length === 0) {
								return of([]);
							}
							return combineLatest(files.map((fileDetails) => this._filesRepository.store.getObjectById$$$(fileDetails.id, true).$));
						}),
						tap((files) => {
							if (DEBUG) console.log('(Effect from folderId) files', { files });
							// this.files.set(files);
							fileTable.explicitItems.set(files);
						})
					)
					.subscribe();
			} else {
				fileTable.explicitItems.set(null);
			}
		});

		effect(() => {
			const fileSearchPattern = this.fileSearchPattern();
			if (DEBUG) console.log('(Effect from fileSearchPattern)', { fileSearchPattern });
		});
	}

	processUploadedFiles(files: (EntityFile | undefined)[]) {
		// todo: if a folder is selected, add the files to the folder

		// refresh page
		const fileTable = this.fileTable();
		if (fileTable) {
			fileTable.paginator.refresh();
		}
	}

	public createNewFolder() {
		this._foldersRepository
			.createNewFolder$(this.folderId())
			.pipe(switchMap(() => this.folderTable().paginator.refresh()))
			.subscribe();
	}
}
