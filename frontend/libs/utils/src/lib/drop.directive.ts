import { Directive, ElementRef, EventEmitter, HostBinding, HostListener, Input, Output, ViewContainerRef } from '@angular/core';

/**
 * Directive to handle file drop from the browser
 * It will add a class 'fileover' to the host element when a file is dragged over it
 * It will emit a filesDropped event with the list of files dropped
 */
@Directive({
	selector: '[dropZone]',
	standalone: true,
})
export class DropDirective {
	@HostBinding('class.fileover') fileOver: boolean = false;
	@Output() filesDropped = new EventEmitter<any>();

	@Input() dropZone?: string = '';

	// constructor(private _elementRef: ElementRef, private _viewContainerRef: ViewContainerRef) {}

	// Dragover listener
	@HostListener('dragover', ['$event']) onDragOver(evt: any) {
		// console.log({ _elementRef: this._elementRef, _viewContainerRef: this._viewContainerRef });
		evt.preventDefault();
		evt.stopPropagation();
	}

	@HostListener('dragenter', ['$event']) onDragEnter(evt: any) {
		evt.preventDefault();
		evt.stopPropagation();
		this.fileOver = true;
	}

	// Dragleave listener
	@HostListener('dragleave', ['$event']) public onDragLeave(evt: any) {
		evt.preventDefault();
		evt.stopPropagation();
		this.fileOver = false;
	}

	// Drop listener
	@HostListener('drop', ['$event']) public ondrop(evt: any) {
		evt.preventDefault();
		evt.stopPropagation();
		this.fileOver = false;
		let files = evt.dataTransfer.files;
		if (files.length > 0) {
			this.filesDropped.emit(files);
		}
	}
}
