import { Directive, HostListener, signal } from '@angular/core';

@Directive({
	selector: '[shiftKey]',
	standalone: true,
})
export class ShiftKeyDirective {
	/**
	 * Signal that tracks whether the shift key is currently pressed
	 */
	public readonly shiftPressed = signal<boolean>(false);

	@HostListener('window:keydown.shift', ['$event'])
	onShiftDown(event: KeyboardEvent) {
		this.shiftPressed.set(true);
	}

	@HostListener('window:keyup.shift', ['$event'])
	onShiftUp(event: KeyboardEvent) {
		this.shiftPressed.set(false);
	}

	@HostListener('window:blur', ['$event'])
	onWindowBlur() {
		// Reset shift state when window loses focus to prevent stuck keys
		this.shiftPressed.set(false);
	}

	@HostListener('window:focus', ['$event'])
	onWindowFocus() {
		// Reset shift state when window gains focus to ensure clean state
		this.shiftPressed.set(false);
	}
}
