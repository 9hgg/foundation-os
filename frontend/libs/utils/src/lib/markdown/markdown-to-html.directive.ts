import { Directive, ElementRef, effect, inject, input } from '@angular/core';
import { MarkdownService } from './markdown.service';

// eslint-disable-next-line @angular-eslint/directive-selector
@Directive({ selector: '[markdown-to-html]', standalone: true })
export class MarkdownToHtmlDirective {
	private _el = inject(ElementRef<HTMLElement>);
	private _markdownService = inject(MarkdownService);

	markdownToHtml = input<string | null | undefined>(undefined, { alias: 'markdown-to-html' });

	constructor() {
		effect(() => {
			this._el.nativeElement.innerHTML = this._markdownService.render(this.markdownToHtml());
		});
	}
}
