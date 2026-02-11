import { FileModals } from '@foundation/files/modals';
import { EntityFile } from '@foundation/files/models';
import { convertToUrl, FilesRepository } from '@foundation/files/state';
import { inject, Injectable } from '@angular/core';
import Quill, { Delta } from 'quill';
import { map } from 'rxjs';
import { extractSemanticAndContent } from './quill.utils';
import { ImageBlot, ImageBlotContextMenuService, VideoBlot, VideoBlotContextMenuService } from '@foundation/quill/blots';

Quill.register(ImageBlot, true);
Quill.register(VideoBlot, true);

const DEFAULT_TOOLBAR_CONFIG = [
	[{ header: ['1', '2', '3', false] }],
	['bold', 'italic', 'underline', 'link'],
	[{ list: 'ordered' }, { list: 'bullet' }],
	[{ align: ['', 'center', 'right', 'justify'] }],
	['image', 'video'],
	['clean'],
];

@Injectable({ providedIn: 'root' })
export class QuillService {
	private _filesRepository = inject(FilesRepository);
	private _fileModals = inject(FileModals);
	private _imageBlotContextMenuService = inject(ImageBlotContextMenuService);
	private _videoBlotContextMenuService = inject(VideoBlotContextMenuService);

	constructor() {
		this._imageBlotContextMenuService.setContextMenuInWindow();
		this._videoBlotContextMenuService.setContextMenuInWindow();
	}

	loadQuill(quillId: string | null, initialContent: Delta | null, htmlElement: HTMLElement, textChangeCallback: (quillTextDetails: { semanticHTML: string; content: Delta }) => void, placeholder: string = 'Start typing...') {
		const quill = new Quill(htmlElement, {
			theme: 'snow',
			modules: {
				toolbar: {
					container: quillId ? '[data-toolbar-id="toolbar-' + quillId + '"]' : DEFAULT_TOOLBAR_CONFIG,
					handlers: {
						image: () => this._useAnExistingFileInQuill(quill, 'image'),
						video: () => this._useAnExistingFileInQuill(quill, 'video'),
					},
				},
			},
			placeholder,
		});

		const quillRoot = quill.root;

		// intercept image drops
		quillRoot.addEventListener(
			'drop',
			(event: DragEvent) => {
				const dataTransfer = event.dataTransfer;
				if (dataTransfer && dataTransfer.files && dataTransfer.files.length > 0) {
					event.preventDefault();
					event.stopImmediatePropagation();

					// Prevent default drop handling (which may insert the image into the editor)
					event.preventDefault();
					for (let i = 0; i < dataTransfer.files.length; i++) {
						const file = dataTransfer.files[i];
						this._handleFileList(quill, [file]);
					}
				}
			},
			true
		);

		// intercept image pastes
		quillRoot.addEventListener(
			'paste',
			(event: ClipboardEvent) => {
				const clipboardData = event.clipboardData;
				if (clipboardData) {
					const files = clipboardData.files;
					if (files && files.length > 0) {
						event.preventDefault();
						event.stopImmediatePropagation();
						for (let i = 0; i < files.length; i++) {
							const file = files[i];
							console.log('Image paste intercepted:', file);
							// Handle the pasted image file
							this._handleFileList(quill, [file]);
						}
					}
				}
			},
			true
		);

		// set editor content
		console.log('[articleBuilder](loadQuill) initialContent', initialContent);

		// Temporarily disable history
		quill.setContents(initialContent || [], 'api');
		quill.history.clear();
		quill.focus();

		quill.on('text-change', () => {
			if (!quill) return;
			const articleContent = extractSemanticAndContent(quill);
			textChangeCallback(articleContent);
		});

		return quill;
	}

	/** Called when uploading multiple file at a time or no need to control the fileId */
	private _handleFileList(quill: Quill, fileList: FileList | File[] | null) {
		this._filesRepository
			.handleFileList$(fileList)
			.pipe(map((res) => res.map((r) => r.result?.file)))
			.subscribe({
				next: (res) => {
					if (res.length && res[0]) {
						const fileToUse = res[0];
						if (fileToUse.kind === 'image' || fileToUse.mimeClient?.includes('image')) {
							this._insertImage(quill, { alt: fileToUse.publicFilename, url: convertToUrl(fileToUse, 'original') });
						} else if (fileToUse.kind === 'video' || fileToUse.mimeClient?.includes('video')) {
							this._insertVideo(quill, { alt: fileToUse.publicFilename, url: convertToUrl(fileToUse, 'original') });
						} else {
							this._insertFileAsLink(quill, fileToUse);
						}
					}
				},
			});
	}

	private _insertImage(quill: Quill, details: { alt: string | undefined; url: string }) {
		const range = quill.getSelection(true);
		quill.insertEmbed(
			range?.index || 0,
			'image',
			{
				alt: details.alt ?? '',
				url: details.url,
			},
			Quill.sources.USER
		);
		quill.setSelection((range?.index || 0) + 1, Quill.sources.SILENT);
	}

	private _insertVideo(quill: Quill, details: { alt: string | undefined; url: string }) {
		const range = quill.getSelection(true);
		quill.insertEmbed(
			range?.index || 0,
			'video',
			{
				alt: details.alt ?? '',
				url: details.url,
			},
			Quill.sources.USER
		);
		quill.setSelection((range?.index || 0) + 1, Quill.sources.SILENT);
	}

	private _insertFileAsLink(quill: Quill, file: EntityFile) {
		const range = quill.getSelection(true);
		quill.insertText(
			range?.index || 0,
			' ' + file.publicFilename + ' ',
			{
				link: convertToUrl(file, 'original'),
			},
			Quill.sources.USER
		);
		quill.setSelection((range?.index || 0) + 1, Quill.sources.SILENT);
	}

	private _useAnExistingFileInQuill(quill: Quill, kind: 'image' | 'video') {
		this._fileModals
			.openFilesSelectionDialog({
				selectionConstraints: {
					single: true,
					maxFiles: 1,
					minFiles: 1,
				},
				filters: [{ fieldName: 'kind', value: kind }],
			})
			.closed.subscribe((result) => {
				console.log('The files selection dialog was closed with this result:', result);
				if (result?.files?.length) {
					const fileToUse = result.files[0];
					if (fileToUse.kind === 'image' || fileToUse.mimeClient?.includes('image')) {
						this._insertImage(quill, { alt: fileToUse.publicFilename, url: convertToUrl(fileToUse, 'original') });
					} else if (fileToUse.kind === 'video' || fileToUse.mimeClient?.includes('video')) {
						this._insertVideo(quill, { alt: fileToUse.publicFilename, url: convertToUrl(fileToUse, 'original') });
					} else {
						this._insertFileAsLink(quill, fileToUse);
					}
				}
			});
	}

	clearQuill(quill: Quill) {
		quill.off('text-change');
	}
}
