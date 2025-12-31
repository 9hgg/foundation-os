import { Directive, HostListener, Output, EventEmitter } from '@angular/core';

@Directive({
	// eslint-disable-next-line @angular-eslint/directive-selector
	selector: '[doubleTap]',
	standalone: true,
})
export class DoubleTapDirective {
	@Output() dbltap = new EventEmitter();

	private lastTap = 0;
	private tapTimeout?: number;

	@HostListener('dblclick', ['$event'])
	onDoubleClick(event: MouseEvent) {
		this.emitEvent(event);
	}

	@HostListener('touchend', ['$event'])
	onTouchEnd(event: TouchEvent) {
		const currentTime = new Date().getTime();
		const tapLength = currentTime - this.lastTap;
		clearTimeout(this.tapTimeout);

		if (tapLength < 300 && tapLength > 0) {
			this.emitEvent(event);
		} else {
			this.tapTimeout = window.setTimeout(() => {
				clearTimeout(this.tapTimeout);
			}, 300);
		}

		this.lastTap = currentTime;
	}

	private emitEvent(event: Event) {
		this.dbltap.emit(event);
	}
}
