import { ExportOption } from '@foundation/canvas';
import { FileModals } from '@foundation/files/modals';
import { EntityFile } from '@foundation/files/models';
import { convertToUrl } from '@foundation/files/state';
import { UploadButtonComponent } from '@foundation/files/ui';
import { TwUploadIcon } from '@foundation/icons';
import { CdkMenu, CdkMenuItem, CdkMenuModule, CdkMenuTrigger } from '@angular/cdk/menu';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MotherComponent } from '../../mother.component';
import { DimensionToolbarComponent } from '../common/dimension-toolbar/dimension-toolbar.component';

@Component({
	selector: 'lib-image-block',
	standalone: true,
	imports: [UploadButtonComponent, CdkMenuModule, CdkMenuItem, CdkMenuItem, CdkMenuTrigger, CdkMenu, FormsModule, TwUploadIcon, DimensionToolbarComponent],
	templateUrl: './image-block.component.html',
	styleUrl: './image-block.component.css',
})
export class ImageBlockComponent extends MotherComponent {
	private _fileModals = inject(FileModals);

	imageSourceKind = signal<'entityFile' | 'url' | 'placeholder' | 'unsplash'>('entityFile');
	imageSourceUrl = signal<string | null>('');
	imageSourceEntityFile = signal<EntityFile | null>(null);

	imageUrl = computed(() => {
		const kind = this.imageSourceKind();
		const entityFile = this.imageSourceEntityFile();

		if (kind === 'entityFile') {
			if (entityFile) {
				return convertToUrl(entityFile);
			}
		} else if (kind === 'url') {
			const imageSourceUrl = this.imageSourceUrl();
			if (imageSourceUrl) {
				return imageSourceUrl;
			}
		}
		return '/assets/interviews/ui/image-placeholder.png';
	});

	alt = signal('');
	disposition = signal<'cover' | 'contain' | 'fill' | 'none' | 'scale-down'>('cover');

	static override getExportOptions(): ExportOption<any>[] {
		const a: ExportOption<'entity-file-id'> = {
			id: 'image-file',
			kind: 'entity-file-id',
			title: 'as URL',
			activeByDefault: false,
			displayedByDefault: false,
			description: 'Export your content as plain text',
			perInteraction: false,
			fn(step, block, interaction, ownerId) {
				const imageSourceKind = block.data?.['imageSourceKind'] as 'entityFile' | 'url' | 'placeholder' | 'unsplash' | undefined;
				const imageSourceUrl = block.data?.['imageSourceUrl'] as string | undefined;
				const imageSourceEntityFile = block.data?.['imageSourceEntityFile'] as EntityFile | undefined;
				if (imageSourceKind === 'entityFile' && imageSourceEntityFile) {
					return imageSourceEntityFile.id;
				}
				return '';
			},
		};
		const b: ExportOption<'image'> = {
			id: 'image-file',
			kind: 'image',
			title: 'image',
			activeByDefault: false,
			displayedByDefault: false,
			description: 'the image',
			perInteraction: false,
			fn(step, block, interaction, ownerId) {
				const imageSourceKind = block.data?.['imageSourceKind'] as 'entityFile' | 'url' | 'placeholder' | 'unsplash' | undefined;

				const imageSourceUrl = block.data?.['imageSourceUrl'] as string | undefined;
				const imageSourceEntityFile = block.data?.['imageSourceEntityFile'] as EntityFile | undefined;

				if (imageSourceKind === 'entityFile' && imageSourceEntityFile) {
					return convertToUrl(imageSourceEntityFile);
				}
				if (imageSourceKind === 'url') {
					if (imageSourceUrl) {
						return imageSourceUrl;
					}
				}
				if (imageSourceKind === 'placeholder') {
					return '/assets/interviews/ui/image-placeholder.png';
				}
				if (imageSourceKind === 'unsplash') {
					return '/assets/interviews/ui/image-placeholder.png';
				}
				return '/assets/interviews/ui/image-placeholder.png';
			},
		};

		return [a, b];
	}

	constructor() {
		super();

		// block
		this.enlistSignalForBlockStorage(this.imageSourceKind);
		this.enlistSignalForBlockStorage(this.imageSourceUrl);
		this.enlistSignalForBlockStorage(this.imageSourceEntityFile);
		this.enlistSignalForBlockStorage(this.alt);
		this.enlistSignalForBlockStorage(this.disposition);
	}

	/**
	 * Check if the entity file has dimensions that allow aspect ratio resize
	 */
	canResizeToAspectRatio = computed(() => {
		const entityFile = this.imageSourceEntityFile();

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
		const entityFile = this.imageSourceEntityFile();
		if (!entityFile) return;

		this._notificationService
			.confirm(`Would you like to resize this image block to match the media's aspect ratio (${entityFile.extra.width}×${entityFile.extra.height})?`, 'Auto-resize to aspect ratio', {
				cancelButtonText: 'No, thanks',
				confirmButtonText: 'Yes, resize',
			})
			.closed.subscribe((confirmed: boolean | undefined) => {
				if (confirmed) {
					this.resizeToAspectRatio();
				}
			});
	}

	/**
	 * Resize the block to match the media aspect ratio
	 */
	public resizeToAspectRatio(): void {
		const entityFile = this.imageSourceEntityFile();
		if (!entityFile?.extra?.width || !entityFile?.extra?.height) {
			console.log('Cannot resize to aspect ratio: entity file does not have width or height');
			return;
		}

		const mediaWidth = entityFile.extra.width;
		const mediaHeight = entityFile.extra.height;
		const aspectRatio = mediaWidth / mediaHeight;

		const currentWidth = this.block$_.width ?? 400;
		const currentHeight = this.block$_.height ?? 300;

		// Determine which dimension to adjust to maintain aspect ratio
		// without exceeding current dimensions

		if (currentWidth / aspectRatio <= currentHeight) {
			// Width is the limiting factor
			this.block$_.width = currentWidth;
			this.block$_.height = Math.round(currentWidth / aspectRatio);
			console.info('Resizing image block to width:', this.block$_.width, 'and height:', this.block$_.height);
		} else {
			// Height is the limiting factor
			this.block$_.height = currentHeight;
			this.block$_.width = Math.round(currentHeight * aspectRatio);
			console.info('Resizing image block to height:', this.block$_.height, 'and width:', this.block$_.width);
		}

		//
	}

	public processUploadedFiles(files: (EntityFile | undefined)[]) {
		console.log('You are uploading these files:', files);
		const files_ = files.filter((f): f is EntityFile => !!f);
		if (files_.length == 0) return;
		const fileToUse = files_[0];
		this.imageSourceKind.set('entityFile');
		this.imageSourceEntityFile.set(fileToUse);
		this.imageSourceUrl.set(convertToUrl(fileToUse));
		this.block$_.name = fileToUse.publicFilename || 'Image Block';

		// Check if we should prompt for auto-resize
		if (this.canResizeToAspectRatio()) {
			this._promptForAspectRatioResize();
		}
	}

	public useAnExistingPicture() {
		this._fileModals
			.openFilesSelectionDialog({
				selectionConstraints: {
					single: true,
					maxFiles: 1,
					minFiles: 1,
				},
				filters: [{ fieldName: 'kind', value: 'image' }],
			})
			.closed.subscribe((result) => {
				console.log('The files selection dialog was closed with this result:', result);
				if (result?.files?.length) {
					const fileToUse = result.files[0];
					this.imageSourceKind.set('entityFile');
					this.imageSourceEntityFile.set(fileToUse);
					this.imageSourceUrl.set(convertToUrl(fileToUse));

					// Check if we should prompt for auto-resize
					if (this.canResizeToAspectRatio()) {
						this._promptForAspectRatioResize();
					}
				}
			});
	}
}
