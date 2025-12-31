import { signal, DestroyRef, inject, Signal } from '@angular/core';

/**
 * Interface for components that have shift key tracking
 */
export interface WithShiftKey {
	shiftPressed: Signal<boolean>;
}

/**
 * Mixin function that adds shift key tracking to a component.
 * Use this as a base class or with composition.
 */
export class ShiftKeyMixin {
	shiftPressed = signal(false);

	constructor() {
		const destroyRef = inject(DestroyRef);

		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.key === 'Shift') {
				this.shiftPressed.set(true);
			}
		};

		const handleKeyUp = (event: KeyboardEvent) => {
			if (event.shiftKey) {
				this.shiftPressed.set(true);
			} else {
				this.shiftPressed.set(false);
			}
		};

		// Add event listeners
		document.addEventListener('keydown', handleKeyDown);
		document.addEventListener('keyup', handleKeyUp);

		// Clean up on destroy
		destroyRef.onDestroy(() => {
			document.removeEventListener('keydown', handleKeyDown);
			document.removeEventListener('keyup', handleKeyUp);
		});
	}
}
