import { ExportOption } from '@foundation/canvas';
import { DefaultTheme } from '@foundation/quill/themes';
import { QuillService } from '@foundation/quill/utils';
import { isEqual, SanitizeHtmlPipe } from '@foundation/utils';
import { ChangeDetectionStrategy, Component, effect, ElementRef, inject, OnDestroy, signal, untracked, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import Quill, { Delta } from 'quill';
import { MotherComponent } from '../../../mother.component';

Quill.register('themes/spoken', DefaultTheme, true);

@Component({
	selector: 'lib-text-block',
	standalone: true,
	imports: [FormsModule, SanitizeHtmlPipe],
	templateUrl: './text-block.component.html',
	styleUrl: './text-block.component.css',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TextBlockComponent extends MotherComponent implements OnDestroy {
	private _quillService = inject(QuillService);

	semanticHTML = signal('click to add your text');
	content = signal<Delta | null>(null);

	quillContainer = viewChild<ElementRef<HTMLDivElement>>('quillContainer');
	quill: Quill | null = null;

	static override getExportOptions(): ExportOption<any>[] {
		const a: ExportOption<'string'> = {
			id: 'paragraphe-as-plain-text',
			kind: 'string',
			title: 'as Text',
			activeByDefault: true,
			displayedByDefault: true,
			description: 'Export your content as plain text',
			perInteraction: true,
			fn(step, block, interaction, ownerId) {
				const HTMLvalue = block.data?.['semanticHTML'] as string | undefined;
				if (!HTMLvalue) return '';
				const div = document.createElement('div');
				div.innerHTML = HTMLvalue;
				const text = div.innerText;
				if (!text) return '';
				if (text === 'undefined') return '';
				if (text === 'null') return '';
				return text;
			},
		};
		const b: ExportOption<'html'> = {
			id: 'paragraphe-as-html',
			kind: 'html',
			title: 'as HTML',
			activeByDefault: false,
			displayedByDefault: false,
			description: 'Export your content as HTML',
			perInteraction: true,
			fn(step, block, interaction, ownerId) {
				const HTMLvalue = block.data?.['semanticHTML'] as string | undefined;
				if (!HTMLvalue) return '';
				return HTMLvalue;
			},
		};

		return [a, b];
	}

	constructor() {
		super();

		this.enlistSignalForBlockStorage(this.semanticHTML);
		this.enlistSignalForBlockStorage(this.content);

		// create a new quill editor when the quillContainer is available
		effect(() => {
			const qc = this.quillContainer();
			// console.log('[textBlock](constructor) effect', this.blockId, qc);
			if (!qc) return;
			let counter = 0;
			// set interval until the toolbar is available
			const interval = setInterval(() => {
				const blockId = this.blockId;
				const toolbar = document.querySelector('[data-toolbar-id="toolbar-' + blockId + '"]');
				if (toolbar && blockId) {
					console.log('[textBlock](constructor) toolbar available', this.blockId);
					clearInterval(interval);

					if (this.quill) {
						this._quillService.clearQuill(this.quill);
						this.quill = null;
					}
					const initialContent = untracked(this.content);
					const initialSemanticHTML = untracked(this.semanticHTML);

					// If we have semanticHTML but no Delta content (e.g., from predefined layouts),
					// convert the HTML to Delta for proper Quill initialization
					let contentToUse = initialContent;
					if (!initialContent && initialSemanticHTML && initialSemanticHTML !== 'click to add your text') {
						// Create a temporary Quill instance to convert HTML to Delta
						const tempDiv = document.createElement('div');
						const tempQuill = new Quill(tempDiv);
						const newDelta = tempQuill.clipboard.convert({ html: initialSemanticHTML });
						console.log('[textBlock](constructor) converted semanticHTML to Delta content', initialSemanticHTML, newDelta);
						contentToUse = newDelta;
					}

					this._quillService.loadQuill(blockId, contentToUse, qc.nativeElement, (quillTextDetails) => {
						this.semanticHTML.set(quillTextDetails.semanticHTML);
						this.content.set(quillTextDetails.content);
					});
				} else {
					console.log('[textBlock](constructor) toolbar not available', this.blockId);
				}
				if (counter > 10) {
					clearInterval(interval);
					console.error('[textBlock](constructor) toolbar not available after 10 tries', this.blockId);
					return;
				}
				counter++;
			}, 50);
		});

		// react to changes in the content coming from the store
		effect(() => {
			const content = this.content();
			if (!this.quill || !content) return;
			const quillContent = this.quill.getContents();
			if (isEqual(content, quillContent)) {
				return;
			}
			this.quill.setContents(content, 'silent');
		});
	}

	override destructor() {
		this.quill ? this._quillService.clearQuill(this.quill) : null;
	}
}
