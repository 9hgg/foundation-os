import { Directive, ElementRef, AfterViewInit } from '@angular/core';

@Directive({
	selector: '[fullSpanRow]',
	standalone: true,
})
export class FullSpanRowDirective implements AfterViewInit {
	constructor(private el: ElementRef) {}

	ngAfterViewInit() {
		this.setFullSpan();
	}

	private setFullSpan() {
		const table = this.el.nativeElement.closest('table');
		if (table) {
			const headerRow = table.querySelector('tr');
			const fullSpanRow = this.el.nativeElement;
			if (headerRow && fullSpanRow) {
				const columnCount = headerRow.children.length;
				const cell = fullSpanRow.querySelector('td');
				if (cell) {
					cell.setAttribute('colspan', columnCount);
				}
			}
		}
	}
}
