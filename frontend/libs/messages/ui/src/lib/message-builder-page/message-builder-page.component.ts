import { CdkDropList } from '@angular/cdk/drag-drop';
import { CdkMenuModule } from '@angular/cdk/menu';
import { PortalModule } from '@angular/cdk/portal';
import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, effect, ElementRef, inject, model, OnInit, signal, untracked, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { FileModals } from '@foundation/files/modals';
import { EntityFile } from '@foundation/files/models';
import { convertToUrl, FilesRepository } from '@foundation/files/state';
import { Message } from '@foundation/messages/models';
import { MessagesRepository } from '@foundation/messages/state';
import { ImageBlot, ImageBlotContextMenuService } from '@foundation/quill/blots';
import { extractSemanticAndContent } from '@foundation/quill/utils';
import { TranslateDirective } from '@foundation/translations/services';
import { BehaviorSubjectReplayed, BehaviorSubjectReplayedProxied, SanitizeHtmlPipe } from '@foundation/utils';
import Quill, { Delta } from 'quill';
import { debounceTime, filter, map, of, skip, take, tap } from 'rxjs';

Quill.register(ImageBlot, true);

@Component({
	selector: 'lib-message-builder-page',
	standalone: true,
	imports: [
		//
		CommonModule,
		FormsModule,
		TranslateDirective,
		RouterModule,
		CdkMenuModule,
		PortalModule,
		CdkDropList,
		SanitizeHtmlPipe,
	],
	templateUrl: './message-builder-page.component.html',
	styleUrls: ['./message-builder-page.component.css'],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MessageBuilderPageComponent implements OnInit {
	private _messagesRepository = inject(MessagesRepository);
	private _filesRepository = inject(FilesRepository);
	private imageBlotContextMenuService = inject(ImageBlotContextMenuService);
	private _fileModals = inject(FileModals);

	public messageId = model<string | null>(null);
	message$$$ = new BehaviorSubjectReplayedProxied<string | null, Message | null>((id: string | null) => {
		return id ? this._messagesRepository.store.getObjectById$$$(id).$ : of(null);
	}, null);

	editing = signal(true);
	semanticHTML = signal('');
	content = signal<Delta | null>(null);

	quillContainer = viewChild<ElementRef<HTMLDivElement>>('quillContainer');
	quill: Quill | null = null;

	messageContent$$$ = new BehaviorSubjectReplayed<{
		semanticHTML: string;
		content: Delta | null;
	}>({
		semanticHTML: '',
		content: null,
	});

	messageIsLoaded = signal(false);

	constructor() {
		// inject the message id into the behavior subject proxied
		effect(() => {
			const messageId = this.messageId();
			this.message$$$.next(messageId);
		});

		// initialise the values once the message is loaded
		this.message$$$
			.pipe(
				takeUntilDestroyed(),
				filter((message): message is Message => !!message),
				take(1),
				tap((message) => {
					this.semanticHTML.set(message.content || '');
					this.content.set(message.config['deltas'] || null);
					this.messageContent$$$.next({
						semanticHTML: message.content || '',
						content: message.config['deltas'] || null,
					});
					this.messageIsLoaded.set(true);
				})
			)
			.subscribe();

		// create a new quill editor when the quillContainer is available
		effect(() => {
			const qc = this.quillContainer();
			const messageId = this.messageId();
			const messageIsLoaded = this.messageIsLoaded();
			if (!messageIsLoaded) return;
			if (!qc) return;
			if (!messageId) return;

			const selector = '[data-toolbar-id="toolbar-' + messageId + '"]';

			const toolbar = document.querySelector(selector);
			if (toolbar) {
				// clearInterval(interval);
				this.clearQuill();
				this.loadQuill(qc.nativeElement);
			}
		});

		// save message content when changing
		this.messageContent$$$
			.pipe(
				skip(2),
				takeUntilDestroyed(),
				debounceTime(300),
				tap((messageContent) => {
					const message = this.message$$$.value;
					if (!message) return;
					message.content = messageContent.semanticHTML;
					message.config['deltas'] = messageContent.content;
					this._messagesRepository.store.save(message);
				})
			)
			.subscribe();
	}

	ngOnInit() {
		this.imageBlotContextMenuService.setContextMenuInWindow();
	}

	updateTitle(newTitle: string) {
		const message = this.message$$$.value;
		if (!message) return;
		message.title = newTitle;
		this._messagesRepository.store.save(message);
	}

	loadQuill(htmlElement: HTMLElement) {
		this.quill = new Quill(htmlElement, {
			theme: 'snow',
			modules: {
				// toolbar: '[data-toolbar-id="toolbar-' + this.messageId() + '"]',
				toolbar: {
					container: '[data-toolbar-id="toolbar-' + this.messageId() + '"]',
					handlers: {
						image: () => this.useAnExistingPictureInQuill(),
					},
				},
			},
			// formats: ['image'],
			placeholder: 'Compose an epic...',
		});

		const quillRoot = this.quill.root;

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
						this._handleFileList([file]);
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
							this._handleFileList([file]);
						}
					}
				}
			},
			true
		);

		// set editor content
		const initialContent = untracked(this.content);
		console.log('[messageBuilder](loadQuill) initialContent', initialContent);

		// Temporarily disable history
		this.quill.setContents(initialContent || [], 'api');
		this.quill.history.clear();
		this.quill.focus();

		this.quill.on('text-change', () => {
			if (!this.quill) return;

			const messageContent = extractSemanticAndContent(this.quill);
			this.semanticHTML.set(messageContent.semanticHTML);
			this.content.set(messageContent.content);
			this.messageContent$$$.next(messageContent);
		});
	}

	clearQuill() {
		if (this.quill) {
			this.quill.off('text-change');
			this.quill = null;
		}
	}

	insertImage(details: { alt: string | undefined; url: string }) {
		if (!this.quill) return;
		const range = this.quill.getSelection(true);
		this.quill.insertEmbed(
			range?.index || 0,
			'image',
			{
				alt: details.alt ?? '',
				url: details.url,
			},
			Quill.sources.USER
		);
		this.quill.setSelection((range?.index || 0) + 1, Quill.sources.SILENT);
	}

	insertFileAsLink(file: EntityFile) {
		if (!this.quill) return;
		const range = this.quill.getSelection(true);
		this.quill.insertText(
			range?.index || 0,
			' ' + file.publicFilename + ' ',
			{
				link: convertToUrl(file, 'original'),
			},
			Quill.sources.USER
		);
		this.quill.setSelection((range?.index || 0) + 1, Quill.sources.SILENT);
	}

	public useAnExistingPictureInQuill() {
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
					this.insertImage({ alt: fileToUse.publicFilename, url: convertToUrl(fileToUse, 'original') });
				}
			});
	}

	/** Called when uploading multiple file at a time or no need to control the fileId */
	private _handleFileList(fileList: FileList | File[] | null) {
		this._filesRepository
			.handleFileList$(fileList)
			.pipe(map((res) => res.map((r) => r.result?.updatedFile)))
			.subscribe({
				next: (res) => {
					if (res.length && res[0]) {
						const fileToUse = res[0];
						if (fileToUse.kind === 'image' || fileToUse.mimeClient?.includes('image')) {
							this.insertImage({ alt: fileToUse.publicFilename, url: convertToUrl(fileToUse, 'original') });
						} else {
							this.insertFileAsLink(fileToUse);
						}
					}
				},
			});
	}

	public convertToUrl = convertToUrl;
}
