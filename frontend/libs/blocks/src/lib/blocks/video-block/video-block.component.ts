import { FileModals } from '@foundation/files/modals';
import { EntityFile } from '@foundation/files/models';
import { convertToUrl, FilesRepository } from '@foundation/files/state';
import { UploadButtonComponent } from '@foundation/files/ui';
import { TwUploadIcon } from '@foundation/icons';
import { NotificationService } from '@foundation/notification';
import { CdkMenu, CdkMenuItem, CdkMenuModule, CdkMenuTrigger } from '@angular/cdk/menu';

import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MotherComponent } from '../../mother.component';

@Component({
	selector: 'lib-video-block',
	standalone: true,
	imports: [UploadButtonComponent, CdkMenuModule, CdkMenuItem, CdkMenuItem, CdkMenuTrigger, CdkMenu, FormsModule, TwUploadIcon],
	templateUrl: './video-block.component.html',
	styleUrl: './video-block.component.css',
})
export class VideoBlockComponent extends MotherComponent {
	private _fileModals = inject(FileModals);

	videoSourceKind = signal<'entityFile' | 'url' | 'placeholder' | 'unsplash'>('entityFile');
	videoSourceUrl = signal<string | null>('');
	videoSourceEntityFile = signal<EntityFile | null>(null);

	videoUrl = computed(() => {
		const kind = this.videoSourceKind();
		const entityFile = this.videoSourceEntityFile();

		if (kind === 'entityFile') {
			if (entityFile) {
				return convertToUrl(entityFile);
			}
		} else if (kind === 'url') {
			const videoSourceUrl = this.videoSourceUrl();
			if (videoSourceUrl) {
				return videoSourceUrl;
			}
		}
		return '/assets/interviews/ui/video-placeholder.mp4';
	});

	subtitleUrl = computed<string | null>(() => {
		const kind = this.videoSourceKind();
		const entityFile = this.videoSourceEntityFile();

		if (kind === 'entityFile') {
			if (entityFile) {
				return convertToUrl(entityFile, 'whisper_transcript_srt');
			}
		}
		return null;
	});

	disposition = signal<'cover' | 'contain' | 'fill' | 'none' | 'scale-down'>('scale-down');

	someSignal = signal(0);

	constructor() {
		super();

		// block
		this.enlistSignalForBlockStorage(this.videoSourceKind);
		this.enlistSignalForBlockStorage(this.videoSourceUrl);
		this.enlistSignalForBlockStorage(this.videoSourceEntityFile);
		this.enlistSignalForBlockStorage(this.disposition);
	}

	public processUploadedFiles(files: (EntityFile | undefined)[]) {
		console.log('You are uploading these files:', files);
		const files_ = files.filter((f): f is EntityFile => !!f);
		if (files_.length == 0) return;
		const fileToUse = files_[0];
		this.videoSourceKind.set('entityFile');
		this.videoSourceEntityFile.set(fileToUse);
		this.videoSourceUrl.set(convertToUrl(fileToUse));

		// Check if we should prompt for auto-resize
		if (this.canResizeToAspectRatio()) {
			this._promptForAspectRatioResize();
		}
	}

	public useAnExistingPicture() {
		console.log('use an existing picture');
		this._fileModals
			.openFilesSelectionDialog({
				selectionConstraints: {
					single: true,
					maxFiles: 1,
					minFiles: 1,
				},
				filters: [{ fieldName: 'kind', value: 'video' }],
			})
			.closed.subscribe((result) => {
				console.log('The files selection dialog was closed with this result:', result);
				if (result?.files?.length) {
					const fileToUse = result.files[0];
					this.videoSourceKind.set('entityFile');
					this.videoSourceEntityFile.set(fileToUse);
					this.videoSourceUrl.set(convertToUrl(fileToUse));

					// Check if we should prompt for auto-resize
					if (this.canResizeToAspectRatio()) {
						this._promptForAspectRatioResize();
					}
				}
			});
	}

	public getFileUrl(file: EntityFile, alternative: string = 'default') {
		return convertToUrl(file, alternative);
	}

	computedAlternativeImageUrl = computed(() => {
		const entityFile = this.videoSourceEntityFile();
		if (entityFile) {
			return convertToUrl(entityFile, 'thumbnail');
		}
		return '/assets/interviews/ui/video-placeholder.png';
	});

	/**
	 * Check if the entity file has dimensions that allow aspect ratio resize
	 */
	canResizeToAspectRatio = computed(() => {
		const entityFile = this.videoSourceEntityFile();
		console.log('Checking if we can resize to aspect ratio for entity file:', entityFile);

		if (!entityFile?.extra?.width || !entityFile?.extra?.height) {
			return false;
		}

		// Only suggest resize if current dimensions don't match the media aspect ratio
		const mediaWidth = entityFile.extra.width;
		const mediaHeight = entityFile.extra.height;
		const mediaAspectRatio = mediaWidth / mediaHeight;

		const currentWidth = this.width();
		const currentHeight = this.height();

		if (!currentWidth || !currentHeight) {
			console.log('No current dimensions set, suggesting resize');
			return true; // No current dimensions, always suggest resize
		}

		const currentAspectRatio = currentWidth / currentHeight;
		const aspectRatioDiff = Math.abs(currentAspectRatio - mediaAspectRatio);

		// Only suggest if aspect ratios differ by more than 1%
		return aspectRatioDiff > 0.01;
	});

	/**
	 * Prompt the user to resize the block to match the media aspect ratio
	 */
	private _promptForAspectRatioResize(): void {
		const entityFile = this.videoSourceEntityFile();
		if (!entityFile) return;

		this._notificationService.confirm(`Would you like to resize this video block to match the media's aspect ratio (${entityFile.extra.width}×${entityFile.extra.height})?`, 'Auto-resize to aspect ratio').closed.subscribe((confirmed) => {
			if (confirmed) {
				this.resizeToAspectRatio();
			}
		});
	}

	/**
	 * Resize the block to match the media aspect ratio
	 */
	public resizeToAspectRatio(): void {
		const entityFile = this.videoSourceEntityFile();
		if (!entityFile?.extra?.width || !entityFile?.extra?.height) {
			return;
		}

		const mediaWidth = entityFile.extra.width;
		const mediaHeight = entityFile.extra.height;
		const aspectRatio = mediaWidth / mediaHeight;

		const currentWidth = this.block$_.width || 400;
		const currentHeight = this.block$_.height || 300;

		// Determine which dimension to adjust to maintain aspect ratio
		// without exceeding current dimensions
		if (currentWidth / aspectRatio <= currentHeight) {
			// Width is the limiting factor
			this.block$_.width = currentWidth;
			this.block$_.height = Math.round(currentWidth / aspectRatio);
		} else {
			// Height is the limiting factor
			this.block$_.height = currentHeight;
			this.block$_.width = Math.round(currentHeight * aspectRatio);
		}
	}
}
