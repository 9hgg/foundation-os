/* eslint-disable @angular-eslint/prefer-inject */
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, Inject } from '@angular/core';
import { EntityFile } from '@foundation/files/models';
import { FileDisplayComponent } from '@foundation/files/ui';

export interface FileDisplayModalData {
	entityFile: EntityFile;
}

@Component({
	selector: 'lib-file-display-modal',
	standalone: true,
	imports: [FileDisplayComponent],
	templateUrl: './file-display-modal.component.html',
	changeDetection: ChangeDetectionStrategy.OnPush,
	styleUrl: './file-display-modal.component.css',
})
export class FileDisplayModalComponent {
	constructor(
		private _dialogRef: DialogRef<void, FileDisplayModalComponent>,
		@Inject(DIALOG_DATA) public data: FileDisplayModalData
	) {}

	close() {
		this._dialogRef.close();
	}
}
