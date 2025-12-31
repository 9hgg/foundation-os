import { AfterViewInit, Directive, ElementRef, OnInit } from '@angular/core';

@Directive({
	selector: '[autoResizeHeight]',
	standalone: true,
})
export class AutoResizeHeightDirective implements OnInit, AfterViewInit {
	constructor(private element: ElementRef) {
		this.autosize(this.element);
	}

	ngOnInit() {
		this.autosize(this.element);
		this.element.nativeElement.addEventListener('keypress', this.autoSizeElement(this.element));
	}

	ngAfterViewInit() {
		this.autosize(this.element);
	}

	autoSizeElement(element: ElementRef) {
		return () => this.autosize(element);
	}

	autosize(element: ElementRef) {
		console.log('(autosize)', {
			scrollHeight: element.nativeElement.scrollHeight,
		});
		setTimeout(() => {
			element.nativeElement.style.height = Math.max(30, element.nativeElement.scrollHeight) + 'px';
		}, 0);
	}
}
