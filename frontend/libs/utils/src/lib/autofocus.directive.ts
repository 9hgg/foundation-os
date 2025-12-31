import { AfterViewInit, Directive, ElementRef, Input } from '@angular/core';

// eslint-disable-next-line @angular-eslint/directive-selector
@Directive({ selector: '[focusauto]', standalone: true })
export class AutofocusDirective implements AfterViewInit {
	@Input() focusauto: boolean = true;
	constructor(private element: ElementRef<HTMLElement>) {}
	ngAfterViewInit() {
		// console.log('AutofocusDirective.ngAfterViewInit', this.focusauto, this.element.nativeElement);
		this.element.nativeElement.focus();
	}
}
