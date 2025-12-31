import { Folder } from '@foundation/folders/models';
import { GenericRepository } from '@foundation/table/state';
import { Injectable } from '@angular/core';
import { EMPTY, switchMap } from 'rxjs';
import { v4 as uuidv4 } from 'uuid';

@Injectable({ providedIn: 'root' })
export class FoldersRepository extends GenericRepository<Folder> {
	constructor() {
		super('folder');
	}

	public goToFolder(folderId: string | null) {
		this._router.navigate(['/', 'host', 'dashboard', 'files'], {
			queryParams: { folderId },
			queryParamsHandling: 'merge',
		});
	}

	/** get folder for a resouce user has ACL on */
	getFolderFor$(resourceId: string, resourceKind: string) {
		return this._requestService.getBasic$<{ folder: Folder }>(
			'/api/folders/for/' + resourceKind + '/' + resourceId,
			{
				recursive: true,
				includeResources: true,
			},
			{
				silentError: true,
			}
		);
	}

	private _i18n_createSentence = this._translationService.prep('Give a name to this folder:');
	private _i18n_createTitle = this._translationService.prep('Create New Folder');
	private _i18n_createBtnMessage = this._translationService.prep('Create Folder');
	private _i18n_createPlaceholder = this._translationService.prep('new folder');

	public createNewFolder$(parentId: string | undefined | null = undefined) {
		const now = new Date();
		const dateTimeString = now.toLocaleDateString() + ' ' + now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

		return this._notificationService
			.prompt(this._i18n_createSentence(), this._i18n_createTitle(), {
				inputPlaceholder: this._i18n_createPlaceholder(),
				defaultValue: this._i18n_createPlaceholder() + ' (' + dateTimeString + ')',
				confirmButtonText: this._i18n_createBtnMessage(),
				width: '400px',
			})
			.closed.pipe(
				switchMap((promptResult) => {
					if (!promptResult) return EMPTY;
					const folderName = promptResult.value;

					if (!folderName) return EMPTY;

					return this.store.postObject$({
						id: uuidv4(),
						name: folderName,
						parentId: parentId ?? undefined,
					});
				})
			);
	}

	private _i18n_renameSentence = this._translationService.prep('Give a new name to this folder:');
	private _i18n_renameTitle = this._translationService.prep('Rename Folder');
	private _i18n_renameButtonText = this._translationService.prep('Rename');
	private _i18n_renamePlaceholder = this._translationService.prep('Folder name');
	public renameFolder(folder: Folder) {
		return this._notificationService
			.prompt(this._i18n_renameSentence(), this._i18n_renameTitle(), {
				defaultValue: folder.name ?? '',
				inputPlaceholder: this._i18n_renamePlaceholder(),
				confirmButtonText: this._i18n_renameButtonText(),
				width: '400px',
			})
			.closed.pipe(
				switchMap((promptResult) => {
					if (!promptResult) return EMPTY;
					const newName = promptResult.value;
					if (!newName) return EMPTY;

					console.log('You want to rename this folder:', folder, 'to', newName);
					return this.store.putObject$({ ...folder, name: newName });
				})
			);
	}

	private _i18n_deleteSentence = this._translationService.prep('Are you sure you want to delete this folder?');
	private _i18n_deleteTitle = this._translationService.prep('Delete Folder');
	private _i18n_deleteButtonText = this._translationService.prep('Delete');
	public deleteFolder(folder: Folder) {
		return this._notificationService
			.confirm(this._i18n_deleteSentence(), this._i18n_deleteTitle(), {
				confirmButtonText: this._i18n_deleteButtonText(),
			})
			.closed.pipe(
				switchMap((confirmed) => {
					if (!confirmed) return EMPTY;

					console.log('You want to delete this:', folder);
					return this.store.deleteObject$(folder.id);
				})
			);
	}

	public addResourceToFolder(folderId: string, resourceKind: string, resourceId: string) {
		return this._requestService.getBasic$(`/api/folders/${folderId}/add/${resourceKind}/${resourceId}`);
	}
}
