import { Injectable } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { BehaviorSubject, fromEvent } from 'rxjs';

@Injectable({
	providedIn: 'root',
})
export class ConnectionStateService {
	public connected$$: BehaviorSubject<boolean> = new BehaviorSubject(navigator.onLine);

	constructor() {
		fromEvent(window, 'online')
			.pipe(takeUntilDestroyed())
			.subscribe(() => {
				this.connected$$.next(true);
			});
		fromEvent(window, 'offline')
			.pipe(takeUntilDestroyed())
			.subscribe(() => {
				this.connected$$.next(false);
			});
	}

	public connected(): boolean {
		return navigator.onLine;
	}
}
