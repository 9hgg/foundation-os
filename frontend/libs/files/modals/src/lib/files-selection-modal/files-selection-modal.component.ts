/* eslint-disable @angular-eslint/prefer-inject */
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { EntityFile } from '@foundation/files/models';

import { ChangeDetectionStrategy, Component, effect, Inject, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { FileTableComponent } from '@foundation/files/ui';
import { Filter } from '@foundation/network/store';
import { TranslateDirective } from '@foundation/translations/services';
import { dialogCloser$ } from '@foundation/utils';
import { tap } from 'rxjs';

export interface FileSelectionConstraints {
	maxFiles?: number;
	minFiles?: number;
	single: boolean;
}

export interface FileSelectionModalData {
	selectionConstraints?: FileSelectionConstraints;
	filters?: Filter[];
}

export const DEFAULT_FILE_SELECTION_MODAL_DATA: Partial<FileSelectionModalData> & Required<Pick<FileSelectionModalData, 'selectionConstraints'>> = {
	selectionConstraints: {
		maxFiles: 1,
		minFiles: 1,
		single: true,
	},
};

export interface FileSelectionModalResult {
	files: EntityFile[];
}

@Component({
	selector: 'lib-files-selection-modal',
	standalone: true,
	imports: [FormsModule, TranslateDirective, FileTableComponent],
	templateUrl: './files-selection-modal.component.html',
	changeDetection: ChangeDetectionStrategy.OnPush,
	styleUrl: './files-selection-modal.component.css',
})
export class FilesSelectionModalComponent {
	fileTableChild = viewChild.required(FileTableComponent);

	constructor(
		private _dialogRef: DialogRef<FileSelectionModalResult, FilesSelectionModalComponent>,
		@Inject(DIALOG_DATA)
		public fileSelectionModalData: FileSelectionModalData
	) {
		// following modal parameters to the file table
		effect(() => {
			const fileTable = this.fileTableChild();
			fileTable.itemsSelector._min = this.fileSelectionModalData.selectionConstraints?.minFiles ?? fileTable.itemsSelector._min;
			fileTable.itemsSelector._max = this.fileSelectionModalData.selectionConstraints?.maxFiles ?? fileTable.itemsSelector._max;
			fileTable.paginator.setAlwaysOnFilters(this.fileSelectionModalData.filters ?? []);
		});

		dialogCloser$(this._dialogRef)
			.pipe(
				takeUntilDestroyed(),
				tap(() => this.dismiss())
			)
			.subscribe();
	}

	close(result: FileSelectionModalResult | undefined) {
		this._dialogRef.close(result);
	}

	dismiss() {
		this._dialogRef.close();
	}

	save() {
		this.close({
			files: this.fileTableChild().itemsSelector.selectedItems,
		});
	}

	cancel() {
		this.dismiss();
	}
}
