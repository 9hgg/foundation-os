import { AfterViewInit, Directive, ElementRef, Input } from '@angular/core';

// eslint-disable-next-line @angular-eslint/directive-selector
@Directive({ selector: '[focusauto]', standalone: true })
export class AutofocusDirective implements AfterViewInit {
	@Input() focusauto: boolean = true;
	// Opt-in: keep the page from scrolling the focused element into view.
	// Defaults to false so existing pages that rely on the scroll keep working.
	@Input() preventScroll: boolean = false;
	constructor(private element: ElementRef<HTMLElement>) {}
	ngAfterViewInit() {
		this.element.nativeElement.focus({ preventScroll: this.preventScroll });
	}
}
