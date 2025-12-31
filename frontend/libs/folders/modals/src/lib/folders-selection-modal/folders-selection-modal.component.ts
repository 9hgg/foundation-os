import { EntityFile } from '@foundation/files/models';
import { convertToUrl, FilesRepository } from '@foundation/files/state';
import { Folder } from '@foundation/folders/models';
import { FolderPathComponent, FolderTableComponent } from '@foundation/folders/ui';
import { Filter } from '@foundation/network/store';
import { dialogCloser$, Resource } from '@foundation/utils';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, Inject, model, OnInit, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { tap } from 'rxjs';

export interface FoldersSelectionConstraints {
	maxFolders?: number;
	minFolders?: number;
	single: boolean;
}

export interface FoldersSelectionModalData {
	selectionConstraints?: FoldersSelectionConstraints;
	filters?: Filter[];
}

export const DEFAULT_FOLDERS_SELECTION_MODAL_DATA: Partial<FoldersSelectionModalData> & Required<Pick<FoldersSelectionModalData, 'selectionConstraints'>> = {
	selectionConstraints: {
		maxFolders: 1,
		minFolders: 1,
		single: true,
	},
};

export interface FoldersSelectionModalResult {
	folders: Folder[];
}

@Component({
	selector: 'lib-folders-selection-modal',
	standalone: true,
	imports: [CommonModule, FormsModule, FolderTableComponent, FolderPathComponent],
	templateUrl: './folders-selection-modal.component.html',
	changeDetection: ChangeDetectionStrategy.OnPush,
	styles: [
		`
			:host {
				display: block;
				padding: 5px;
				width: 100%;
				height: 100%;
				overflow: auto;
				/* font-size: 0px; */
				min-width: 200px;
				min-height: 200px;
			}
		`,
	],
	styleUrls: ['./folders-selection-modal.component.css'],
})
export class FoldersSelectionModalComponent implements OnInit {
	// get the folder table component
	foldersCmpView = viewChild.required<FolderTableComponent>('foldersCmp');
	folderId = model<string | null>(null);

	maxFolders = model<number | null>(null);

	constructor(
		private _dialogRef: DialogRef<FoldersSelectionModalResult, FoldersSelectionModalComponent>,
		@Inject(DIALOG_DATA)
		public foldersSelectionModalData: FoldersSelectionModalData,
		private _filesRepository: FilesRepository
	) {
		this.maxFolders.set(this.foldersSelectionModalData.selectionConstraints?.maxFolders ?? null);

		dialogCloser$(this._dialogRef)
			.pipe(
				takeUntilDestroyed(),
				tap((e) => {
					this.dismiss();
				})
			)
			.subscribe();

		console.log('File selection modal open with:', this.foldersSelectionModalData);
	}

	ngOnInit() {
		this.foldersCmpView().itemsSelector._max = this.foldersSelectionModalData.selectionConstraints?.maxFolders ?? Infinity;
		this.foldersCmpView().itemsSelector._min = this.foldersSelectionModalData.selectionConstraints?.minFolders ?? 0;
	}

	close(result: FoldersSelectionModalResult | undefined) {
		this._dialogRef.close(result);
	}

	dismiss() {
		this._dialogRef.close();
	}

	save() {
		// check validity
		if (!this.foldersCmpView().itemsSelector.valid) {
			return;
		}
		this.close({
			folders: this.foldersCmpView().itemsSelector.selectedItems,
		});
	}

	cancel() {
		this.dismiss();
	}

	trackByFn(index: number, item?: Resource) {
		return item?.id;
	}

	getFileUrl(file: EntityFile) {
		return convertToUrl(file);
	}
}
