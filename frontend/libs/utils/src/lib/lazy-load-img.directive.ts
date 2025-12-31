import { Directive, ElementRef, inject } from '@angular/core';

// eslint-disable-next-line @angular-eslint/directive-selector
@Directive({ selector: 'img', standalone: true })
export class LazyLoadImgDirective {
	el = inject(ElementRef<HTMLImageElement>);
	constructor() {
		const supports = 'loading' in HTMLImageElement.prototype;

		if (supports) {
			console.log('[LazyLoadImgDirective] lazy loading IS supported');
			this.el.nativeElement.setAttribute('loading', 'lazy');
		} else {
			console.log('[LazyLoadImgDirective] lazy loading not supported');
		}
	}
}
