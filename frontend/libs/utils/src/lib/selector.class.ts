import { map } from 'rxjs';
import { BehaviorSubjectReplayed } from './utils';
import { signal } from '@angular/core';

/**
 * Selector class
 * @description Selector class allows to :
 * - select,
 * - unselect,
 * - get selected items
 * - get a Subject of selected items
 * - know if an item is selected
 * - limit the number of selected items (min and max)
 * - return a valid state
 */
export class Selector<T> {
	_min = 0;
	_max = Infinity;

	/** The list of selected items */
	private _selectedItems$$$: BehaviorSubjectReplayed<T[]> = new BehaviorSubjectReplayed<T[]>([]);
	public selectedItems_sig = signal<T[]>([]);

	get numSelected() {
		return this.selectedItems.length;
	}

	get selectedItems() {
		return this._selectedItems$$$.value;
	}

	get selectedItems$() {
		return this._selectedItems$$$.$;
	}

	private valid$ = this._selectedItems$$$.pipe(
		map((items) => {
			return items.length >= this._min && items.length <= this._max;
		})
	);

	get valid() {
		return this._selectedItems$$$.value.length >= this._min && this._selectedItems$$$.value.length <= this._max;
	}

	constructor(
		//
		private equal: (itemA: T, itemB: T) => boolean = (a, b) => a === b,
		items: T[] = [],
		min = 0,
		max = Infinity
	) {
		this._min = min;
		this._max = max;
		this._selectedItems$$$.next(items);
	}

	isSelected(item: T) {
		return this._selectedItems$$$.value.find((i) => this.equal(i, item)) !== undefined;
	}

	isSelected$(item: T) {
		return this.selectedItems$.pipe(map((items) => items.find((i) => this.equal(i, item)) !== undefined));
	}

	/**
	 * Select an item
	 * @param item
	 */
	select(item: T) {
		if (this.isSelected(item)) return;
		// if max is 1, replace the selected item, else add the item to the selected items
		if (this._max === 1) {
			this._selectedItems$$$.value = [item];
			this.selectedItems_sig.set(this._selectedItems$$$.value);
			return;
		}
		this._selectedItems$$$.value = [...this._selectedItems$$$.value, item];
		this.selectedItems_sig.set(this._selectedItems$$$.value);
	}

	selectOnly(item: T) {
		this._selectedItems$$$.value = [item];
		this.selectedItems_sig.set(this._selectedItems$$$.value);
	}

	/**
	 * Unselect an item
	 * @param item
	 */
	unselect(item: T) {
		this._selectedItems$$$.value = this._selectedItems$$$.value.filter((i) => !this.equal(i, item));
		this.selectedItems_sig.set(this._selectedItems$$$.value);
	}

	/**
	 * Toggle the selection of an item
	 * @param item
	 */
	toggle(item: T) {
		if (this.isSelected(item)) {
			this.unselect(item);
		} else {
			this.select(item);
		}
	}

	/**
	 * Unselect all items
	 */
	unselectAll() {
		this._selectedItems$$$.value = [];
		this.selectedItems_sig.set([]);
	}

	/**
	 * Select multiple items
	 */
	selectMultiple(items: T[]) {
		const newItems = items.filter((item) => !this.isSelected(item));
		this._selectedItems$$$.value = [...this._selectedItems$$$.value, ...newItems];
		this.selectedItems_sig.set(this._selectedItems$$$.value);
	}

	allToggle(allItems: (T | null)[]) {
		// if some items are selected, unselect all
		if (this.selectedItems.length > 0) {
			this.unselectAll();
			return;
		}
		// else select all
		const allItemsFiltered = allItems.filter((item): item is T => item !== null);
		this.selectMultiple(allItemsFiltered);
	}
}
