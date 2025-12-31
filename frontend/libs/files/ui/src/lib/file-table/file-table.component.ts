import { AccessService } from '@foundation/shared/access';
import { EntityFile } from '@foundation/files/models';
import { convertToUrl, FilesRepository } from '@foundation/files/state';
import { FoldersModals } from '@foundation/folders/modals';
import { TranslationsRepository } from '@foundation/translations/state';
import { TranslationService } from '@foundation/translations/services';
import { TranslationTableComponent } from '@foundation/translations/ui';
import { TranslatePipe, TranslateDirective } from '@foundation/translations/services';
import { PlayButtonComponent, SubtitleLoaderComponent } from '@foundation/media/play/ui';
import { BehaviorType, RepositoryTableComponent } from '@foundation/table/ui';
import { OctetHumanReadablePipe } from '@foundation/utils';
import { CdkMenu, CdkMenuItem, CdkMenuModule } from '@angular/cdk/menu';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Attribute, ChangeDetectionStrategy, Component, HostListener, inject, model, signal } from '@angular/core';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { DomSanitizer } from '@angular/platform-browser';
import { map, switchMap, take, tap } from 'rxjs';
import { DownloadButtonComponent } from '../download-button/download-button.component';

const DEBUG = false;

@Component({
	selector: 'lib-file-table',
	standalone: true,
	imports: [CommonModule, TranslateDirective, TranslatePipe, ReactiveFormsModule, FormsModule, CdkMenuModule, CdkMenu, CdkMenuItem, OctetHumanReadablePipe, PlayButtonComponent, SubtitleLoaderComponent, DownloadButtonComponent],
	templateUrl: './file-table.component.html',
	styleUrl: './file-table.component.css',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FileTableComponent extends RepositoryTableComponent<EntityFile, FilesRepository> {
	private _accessService = inject(AccessService);
	private sanitizer = inject(DomSanitizer);
	private _http = inject(HttpClient);
	private _foldersModal = inject(FoldersModals);

	folderId = model<string | null>(null);

	public shiftPressed = signal<boolean>(false);

	@HostListener('window:keydown.shift', ['$event'])
	onShiftDown() {
		this.shiftPressed.set(true);
	}

	@HostListener('window:keyup.shift', ['$event'])
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

	public getFileUrl(file: EntityFile, alternative: string = 'default', download: boolean = false) {
		return convertToUrl(file, alternative, download);
	}

	alreadyTried = new Set<string>();

	public onSrcError(event: Event, fallbackSrc: string) {
		if (this.alreadyTried.has(fallbackSrc)) {
			console.warn('Already tried to load this fallback source:', fallbackSrc);
			return;
		}

		this.alreadyTried.add(fallbackSrc);

		const imgElement = event.target as HTMLImageElement;
		// imgElement.src = fallbackSrc + '?' + Date.now();
		imgElement.src = fallbackSrc;
	}

	public fetchTextContent$(fileUrl: string) {
		return this._http.get(fileUrl, { responseType: 'text' }).pipe(
			take(1),
			tap((content) => {
				console.log({
					content,
					escaped: this._escapeHtml(content),
					sanitized: this.sanitizer.bypassSecurityTrustHtml(this._escapeHtml(content)),
				});
			}),
			map(() => 'coucou')
		);
	}

	private _escapeHtml(text: string): string {
		const div = document.createElement('div');
		div.appendChild(document.createTextNode(text));
		return div.innerHTML;
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
