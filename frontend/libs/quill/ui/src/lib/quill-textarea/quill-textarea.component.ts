import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, ElementRef, HostListener, inject, input, model, OnDestroy, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { QuillService, extractSemanticAndContent } from '@foundation/quill/utils';
import { FormsModule } from '@angular/forms';
import Quill from 'quill';
import { debounceTime, distinctUntilChanged, Subject } from 'rxjs';

@Component({
	selector: 'lib-quill-textarea',
	standalone: true,
	imports: [CommonModule, FormsModule],
	templateUrl: './quill-textarea.component.html',
	styleUrl: './quill-textarea.component.css',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class QuillTextareaComponent implements OnDestroy {
	private _quillService = inject(QuillService);
	private _htmlChange$ = new Subject<string>();

	html = model<string>('');
	showEditorToggle = input<boolean>(false);
	disableShit = input<boolean>(false);

	isRawHtmlMode = signal<boolean>(false);
	private _shiftToggleRevealed = signal<boolean>(false);
	isToggleVisible = computed(() => this.showEditorToggle() || this._shiftToggleRevealed());

	quillContainer = viewChild<ElementRef<HTMLDivElement>>('quillContainer');
	quill: Quill | null = null;

	constructor() {
		// Set up the debounce pipeline for HTML changes
		this._htmlChange$
			.pipe(
				takeUntilDestroyed(),
				debounceTime(500),
				distinctUntilChanged()
			)
			.subscribe((value) => {
				if (this.html() !== value) {
					this.html.set(value);
				}
			});

		effect(() => {
			if (this.isRawHtmlMode()) {
				if (this.quill) {
					this.html.set(this.getCleanHtml(this.quill));
					this._quillService.clearQuill(this.quill);
					this.quill = null;
				}
				return;
			}

			const container = this.quillContainer();
			if (container && !this.quill) {
				const initialHtml = this.html();

				// Initialize Quill with empty content initially (passed as null delta)
				// The loadQuill method handles the basic setup including toolbar
				// Note: we pass null as quillId so it uses default/generic toolbar
				this.quill = this._quillService.loadQuill(null, null, container.nativeElement, (details) => {
					// This callback runs on text-change
					// We push to the subject to debounce updates
					this._htmlChange$.next(details.semanticHTML);
				});

				// Set the initial HTML content
				if (initialHtml && this.quill) {
					this.quill.clipboard.dangerouslyPasteHTML(initialHtml);
				}
			}
		});

		effect(() => {
			const newValue = this.html();
			if (this.quill && newValue !== this.quill.root.innerHTML && newValue !== this.getCleanHtml(this.quill)) {
				// Only update if significantly different
				// We prefer dangerouslyPasteHTML to set content
				// but check if it's just a loop back from the callback
				this.quill.clipboard.dangerouslyPasteHTML(newValue);
			}
		});
	}

	@HostListener('document:keydown', ['$event'])
	onDocumentKeydown(event: KeyboardEvent) {
		if (event.key !== 'Shift') return;
		if (this.disableShit()) return;
		if (this.isToggleVisible()) return;
		this._shiftToggleRevealed.set(true);
	}

	toggleEditorMode() {
		this.isRawHtmlMode.update((value) => !value);
	}

	private getCleanHtml(quill: Quill): string {
		return extractSemanticAndContent(quill).semanticHTML;
	}

	ngOnDestroy() {
		if (this.quill) {
			this._quillService.clearQuill(this.quill);
		}
		this._htmlChange$.complete();
	}
}
