import { FileModals } from '@foundation/files/modals';
import { EntityFile } from '@foundation/files/models';
import { convertToUrl } from '@foundation/files/state';
import { UploadButtonComponent } from '@foundation/files/ui';
import { TwUploadIcon } from '@foundation/icons';
import { PlayButtonComponent } from '@foundation/media/play/ui';
import { CdkMenu, CdkMenuItem, CdkMenuModule, CdkMenuTrigger } from '@angular/cdk/menu';
import { ChangeDetectionStrategy, Component, computed, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MotherComponent } from '../../../mother.component';

@Component({
	selector: 'lib-audio-block',
	standalone: true,
	imports: [UploadButtonComponent, CdkMenuModule, CdkMenuItem, CdkMenuItem, CdkMenuTrigger, CdkMenu, FormsModule, TwUploadIcon, PlayButtonComponent],
	templateUrl: './audio-block.component.html',
	styleUrl: './audio-block.component.css',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AudioBlockComponent extends MotherComponent implements OnDestroy {
	private _fileModals = inject(FileModals);

	audioSourceKind = signal<'entityFile' | 'url' | 'placeholder'>('entityFile');
	audioSourceUrl = signal<string | null>('');
	audioTitle = signal<string | null>('');
	audioSourceEntityFile = signal<EntityFile | null>(null);

	textColor = signal<string>('inherit');
	backgroundColor = signal<string>('inherit');
	borderColor = signal<string>('inherit');
	borderRadius = signal<string>('inherit');

	audioUrl = computed(() => {
		const kind = this.audioSourceKind();
		const entityFile = this.audioSourceEntityFile();

		if (kind === 'entityFile') {
			if (entityFile) {
				return convertToUrl(entityFile);
			}
		} else if (kind === 'url') {
			const audioSourceUrl = this.audioSourceUrl();
			if (audioSourceUrl) {
				return audioSourceUrl;
			}
		}
		return '/assets/interviews/ui/crowd-cheering.mp3';
	});

	constructor() {
		super();

		this.enlistSignalForBlockStorage(this.audioSourceKind);
		this.enlistSignalForBlockStorage(this.audioSourceUrl);
		this.enlistSignalForBlockStorage(this.audioSourceEntityFile);
		this.enlistSignalForBlockStorage(this.audioTitle);

		this.enlistSignalForBlockStorage(this.textColor);
		this.enlistSignalForBlockStorage(this.backgroundColor);

		// todo: en fonction du audioSourceKind on peut faire un ngIf dans le template
		// effect(() => {

		// });
	}

	public processUploadedFiles(files: (EntityFile | undefined)[]) {
		console.log('You are uploading these files:', files);
		const files_ = files.filter((f): f is EntityFile => !!f);
		if (files_.length == 0) return;
		const fileToUse = files_[0];
		this.audioSourceKind.set('entityFile');
		this.audioSourceEntityFile.set(fileToUse);
		this.audioSourceUrl.set(convertToUrl(fileToUse));
	}

	public useAnExistingFile() {
		console.log('use an existing picture');
		this._fileModals
			.openFilesSelectionDialog({
				selectionConstraints: {
					single: true,
					maxFiles: 1,
					minFiles: 1,
				},
				filters: [{ fieldName: 'kind', value: 'audio' }],
			})
			.closed.subscribe((result) => {
				console.log('The files selection dialog was closed with this result:', result);
				if (result?.files?.length) {
					const fileToUse = result.files[0];
					this.audioSourceKind.set('entityFile');
					this.audioSourceEntityFile.set(fileToUse);
					this.audioSourceUrl.set(convertToUrl(fileToUse));
				}
			});
	}
}
