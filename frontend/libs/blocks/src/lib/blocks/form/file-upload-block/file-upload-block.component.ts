import { EntityFile } from '@foundation/files/models';
import { convertToUrl } from '@foundation/files/state';
import { UploadButtonComponent } from '@foundation/files/ui';
import { TwDeleteIcon, TwDownloadIcon, TwUploadIcon } from '@foundation/icons';
import { OctetHumanReadablePipe } from '@foundation/utils';

import { ExportOption } from '@foundation/canvas';

import { ChangeDetectionStrategy, Component, computed, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MotherComponent } from '../../../mother.component';

@Component({
	selector: 'lib-file-upload-block',
	standalone: true,
	imports: [FormsModule, UploadButtonComponent, TwUploadIcon, TwDownloadIcon, TwDeleteIcon, OctetHumanReadablePipe],
	templateUrl: './file-upload-block.component.html',
	styleUrl: './file-upload-block.component.css',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FileUploadBlockComponent extends MotherComponent implements OnDestroy {
	uploadedFiles = signal<EntityFile[]>([]);
	allowMultiple = signal<boolean>(false);
	acceptedFileTypes = signal<string>('*');
	maxFileSize = signal<number>(10); // in MB
	label = signal<string>('Upload File');
	description = signal<string>('Click to browse or drag and drop files here');

	// Computed properties
	hasFiles = computed(() => this.uploadedFiles().length > 0);
	fileCount = computed(() => this.uploadedFiles().length);
	totalSize = computed(() => {
		return this.uploadedFiles().reduce((total, file) => {
			return total + (file.size || 0);
		}, 0);
	});

	// Get total file size in bytes for pipe
	getTotalFileSize = computed(() => this.totalSize());

	static override getExportOptions(): ExportOption<any>[] {
		const fileListOption: ExportOption<'download-links'> = {
			id: 'uploaded-files-list',
			kind: 'download-links',
			title: 'as Files',
			activeByDefault: true,
			displayedByDefault: true,
			description: 'Export the uploaded files with download links',
			perInteraction: true,
			fn(step, block, interaction, ownerId) {
				if (!interaction) return [];
				const interviewId = ownerId;
				const propertyId = 'uploadedFiles';
				const propertyKey = `${interviewId}.${step.id}.${block.id}.${propertyId}`;
				const files = interaction.config[propertyKey] as EntityFile[] | undefined;
				if (!files) return [];
				return files.map((file) => ({
					title: file.originalFilename || file.publicFilename || 'Unknown file',
					link: convertToUrl(file, undefined, true),
				}));
			},
		};

		const fileCountOption: ExportOption<'number'> = {
			id: 'uploaded-files-count',
			kind: 'number',
			title: 'as Count',
			activeByDefault: false,
			displayedByDefault: false,
			description: 'Export the number of uploaded files',
			perInteraction: true,
			fn(step, block, interaction, ownerId) {
				if (!interaction) return 0;
				const interviewId = ownerId;
				const propertyId = 'uploadedFiles';
				const propertyKey = `${interviewId}.${step.id}.${block.id}.${propertyId}`;
				const files = interaction.config[propertyKey] as EntityFile[] | undefined;
				return files?.length || 0;
			},
		};

		return [fileListOption, fileCountOption];
	}

	constructor() {
		super();
		this.enlistSignalForInteractionStorage(this.uploadedFiles);
		this.enlistSignalForBlockStorage(this.allowMultiple);
		this.enlistSignalForBlockStorage(this.acceptedFileTypes);
		this.enlistSignalForBlockStorage(this.maxFileSize);
		this.enlistSignalForBlockStorage(this.label);
		this.enlistSignalForBlockStorage(this.description);
	}

	onFilesUploaded(files: (EntityFile | undefined)[]): void {
		if (this.canvasManager?.editorMode === 'edit') return;

		const validFiles = files.filter((file): file is EntityFile => file !== undefined);

		if (this.allowMultiple()) {
			// Add to existing files
			this.uploadedFiles.set([...this.uploadedFiles(), ...validFiles]);
		} else {
			// Replace existing files (single file mode)
			this.uploadedFiles.set(validFiles.slice(0, 1));
		}
	}

	removeFile(index: number): void {
		if (this.canvasManager?.editorMode === 'edit') return;

		const currentFiles = this.uploadedFiles();
		const newFiles = currentFiles.filter((_, i) => i !== index);
		this.uploadedFiles.set(newFiles);
	}

	downloadFile(file: EntityFile): void {
		const url = convertToUrl(file);
		const link = document.createElement('a');
		link.href = url;
		link.download = file.originalFilename || file.publicFilename || 'download';
		document.body.appendChild(link);
		link.click();
		document.body.removeChild(link);
	}

	getFileIcon(file: EntityFile): string {
		const mimeType = file.mime || file.mimeClient || '';
		const extension = file.extension || file.extensionClient || '';

		// Document types
		if (mimeType.includes('pdf') || extension === 'pdf') return '📄';
		if (mimeType.includes('word') || ['doc', 'docx'].includes(extension)) return '📝';
		if (mimeType.includes('excel') || ['xls', 'xlsx'].includes(extension)) return '📊';
		if (mimeType.includes('powerpoint') || ['ppt', 'pptx'].includes(extension)) return '📺';

		// Image types
		if (mimeType.startsWith('image/')) return '🖼️';

		// Video types
		if (mimeType.startsWith('video/')) return '🎥';

		// Audio types
		if (mimeType.startsWith('audio/')) return '🎵';

		// Archive types
		if (['zip', 'rar', '7z', 'tar', 'gz'].includes(extension)) return '📦';

		// Code files
		if (['js', 'ts', 'html', 'css', 'json', 'xml'].includes(extension)) return '💻';

		// Default
		return '📎';
	}

	onLabelChange(event: Event): void {
		const target = event.target as HTMLElement;
		this.label.set(target.textContent || 'Upload File');
	}

	onDescriptionChange(event: Event): void {
		const target = event.target as HTMLElement;
		this.description.set(target.textContent || 'Click to browse or drag and drop files here');
	}
}
