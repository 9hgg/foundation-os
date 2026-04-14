/* eslint-disable @angular-eslint/prefer-inject */
import { CdkMenu, CdkMenuItem, CdkMenuModule } from '@angular/cdk/menu';
import { CommonModule } from '@angular/common';
import { Attribute, ChangeDetectionStrategy, Component, inject, model, signal } from '@angular/core';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { EntityFile } from '@foundation/files/models';
import { FilesRepository } from '@foundation/files/state';
import { FoldersModals } from '@foundation/folders/modals';
import { AccessService } from '@foundation/shared/access';
import { BehaviorType, RepositoryTableComponent } from '@foundation/table/ui';
import { TranslateDirective, TranslatePipe } from '@foundation/translations/services';
import { OctetHumanReadablePipe } from '@foundation/utils';
import { switchMap } from 'rxjs';
import { DownloadButtonComponent } from '../download-button/download-button.component';
import { FileDisplayComponent } from '../file-display/file-display.component';
import { FileThumbnailComponent } from '../file-thumbnail/file-thumbnail.component';

@Component({
	selector: 'lib-file-table',
	standalone: true,
	imports: [CommonModule, TranslateDirective, TranslatePipe, ReactiveFormsModule, FormsModule, CdkMenuModule, CdkMenu, CdkMenuItem, OctetHumanReadablePipe, DownloadButtonComponent, FileThumbnailComponent, FileDisplayComponent],
	templateUrl: './file-table.component.html',
	styleUrl: './file-table.component.css',
	changeDetection: ChangeDetectionStrategy.OnPush,
	host: {
		'(window:keydown.shift)': 'onShiftDown()',
		'(window:keyup.shift)': 'onShiftUp()',
	},
})
export class FileTableComponent extends RepositoryTableComponent<EntityFile, FilesRepository> {
	private _accessService = inject(AccessService);
	private _foldersModal = inject(FoldersModals);

	folderId = model<string | null>(null);

	public shiftPressed = signal<boolean>(false);

	onShiftDown() {
		this.shiftPressed.set(true);
	}

	onShiftUp() {
		this.shiftPressed.set(false);
	}

	constructor(
		private _repository: FilesRepository,
		@Attribute('click-behavior') clickBehavior: BehaviorType,
		@Attribute('item-kind') itemKind?: string
	) {
		super(
			_repository,
			{
				pageSize: 10,
				orderingBy: {
					direction: 'desc',
					fieldName: 'time_created',
				},
			},
			clickBehavior,
			itemKind
		);
	}

	public renameFile(file: EntityFile) {
		this._repository
			.renameFile(file)
			.pipe(switchMap(() => this.paginator.refresh()))
			.subscribe();
	}

	public deleteFile(file: EntityFile) {
		this._repository
			.deleteFile(file)
			.pipe(switchMap(() => this.paginator.refresh()))
			.subscribe();
	}

	public addToFolder(file: EntityFile) {
		this._foldersModal
			.openFolderSelectionDialog({
				selectionConstraints: {
					single: false,
					minFolders: 1,
					maxFolders: 10,
				},
			})
			.closed.subscribe((result) => {
				console.log('The folders selection dialog was closed with this result:', result);
				if (result && result.folders.length > 0) {
					result.folders.forEach((folder) => {
						console.log('You selected this folder:', folder);
						this._requestService.getBasic$('/api/folders/' + folder.id + '/add/file/' + file.id).subscribe();
					});
				}
			});
	}

	public removeFromFolder(folderId: string, file: EntityFile) {
		this._requestService.getBasic$('/api/folders/' + folderId + '/remove/file/' + file.id).subscribe((response) => {
			console.log('File removed from folder:', response);
			if (this.folderId() === folderId) {
				this.folderId.set(null); // Reset folderId to refresh the table
				this.folderId.set(folderId); // Re-set to trigger a refresh
			}
		});
	}

	displayFileDetails(entityFile: EntityFile) {
		this._notificationService.notify("<pre class='overflow-auto w-full h-96'>" + JSON.stringify(entityFile, undefined, 2) + '</pre>', 'File details');
	}

	refreshThumbnail(entityFile: EntityFile) {
		this._repository.updateAfterUpload$(entityFile.id, true).subscribe({
			next: (updatedFile) => {
				console.log('Updated file after thumbnail refresh:', updatedFile);
				// Optionally, you can trigger a refresh of the table or the specific file
				this.paginator.refresh();
			},
			error: (error) => {
				this._notificationService.error('Failed to refresh thumbnail: ' + error.message);
				console.error('Error refreshing thumbnail:', error);
			},
		});
	}

	public shareWithTeam(entityFile: EntityFile) {
		this._accessService.shareWithTeam(entityFile.id, 'file');
	}

	public openSharingDetails(entityFile: EntityFile) {
		this._accessService.openSharingDetails(entityFile.id, 'file');
	}
}
