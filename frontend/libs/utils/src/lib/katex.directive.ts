import { Directive, ElementRef, Input, OnChanges, Renderer2 } from '@angular/core';
import katex from 'katex';
import { convertExpressionToLatex } from './katex-expression.utils';

@Directive({
	selector: '[katex]',
	standalone: true,
})
export class KatexDirective implements OnChanges {
	@Input() katex = '';
	@Input() katexDisplayMode = false;

	constructor(
		private _elementRef: ElementRef<HTMLElement>,
		private _renderer: Renderer2
	) {}

	ngOnChanges() {
		const expression = this.katex?.trim();
		if (!expression) {
			this._renderer.setProperty(this._elementRef.nativeElement, 'innerHTML', '');
			return;
		}

		const renderedExpression = katex.renderToString(convertExpressionToLatex(expression), {
			displayMode: this.katexDisplayMode,
			throwOnError: false,
			strict: 'ignore',
		});
		this._renderer.setProperty(this._elementRef.nativeElement, 'innerHTML', renderedExpression);
	}
}
