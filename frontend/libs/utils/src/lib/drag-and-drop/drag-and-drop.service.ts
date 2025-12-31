import { Injectable } from '@angular/core';
import { Subject, throttleTime } from 'rxjs';
import { BehaviorSubjectReplayed } from '../utils';

@Injectable({
	providedIn: 'root',
})
export class DragAndDropService {
	private _data?: any;
	public get data(): any {
		return this._data;
	}
	public set data(value: any) {
		this._data = value;
		console.log('DragAndDropService: data set', value);
	}
	dataKind?: 'something' | string;

	isDragging$ = new BehaviorSubjectReplayed<boolean>(false);
	dragState$ = new BehaviorSubjectReplayed<{ x: number; y: number; operation: 'move' | 'drop' } | null>(null);

	throttledDragState$ = this.dragState$.pipe(
		throttleTime(100, undefined, {
			leading: true,
			trailing: true,
		})
	);

	dropped$ = new Subject<{ x: number; y: number; data: any; kind: 'something' | string }>();

	constructor() {
		// listen to drag events over the document

		document.addEventListener('dragenter', (event) => {
			this.isDragging$.next(true);
		});

		document.addEventListener('mouseleave', (e) => {
			if (this.isDragging$.value == true && (e.target === document || e.target === document.documentElement)) {
				this.isDragging$.next(false);
			}
		});

		document.addEventListener('dragleave', (e) => {
			if (e.target === document || e.target === document.documentElement) {
				this.isDragging$.next(false);
			}
		});

		document.addEventListener('drop', (e) => {
			this.isDragging$.next(false);
		});

		document.addEventListener('dragend', (e) => {
			this.isDragging$.next(false);
		});

		// safe: if mouse is moving but no button is pressed, dragend is not fired
		document.addEventListener('mousemove', (e) => {
			if (e.buttons === 0) {
				// warning: this behavior is not consistent across browsers
				// in particular to handle mac book force touch trackpads
				this.isDragging$.next(false);
				return;
			}

			// if (!this.data) {
			// 	// if no data is set, we don't want to track the drag state
			// 	return;
			// }

			// this.dragState$.next({ x: e.clientX, y: e.clientY, operation: 'move' });
		});
	}

	clear() {
		this.data = undefined;
		this.dataKind = undefined;
	}

	drop(x: number, y: number): void {
		if (!this.data) {
			console.warn('DragAndDropService: no data to drop');
			return;
		}
		console.log('DragAndDropService: dropping data at', x, y, this.data);
		this.dropped$.next({ x, y, data: this.data, kind: this.dataKind ?? 'something' });
		this.clear();
	}
}
