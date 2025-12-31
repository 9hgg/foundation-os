import { ChangeDetectorRef, inject } from '@angular/core';
import { Directive } from '@angular/core';
import { Subject, throttleTime } from 'rxjs';

const DEBUG = false;
const DEBUG_CHECKED = false;

@Directive()
export class Checkable {
	checkAskedCount = 0;
	checkCalledCount = 0;
	checkedCount = 0;
	detectChanges = 0;
	_componentLoaded = false;
	debug = false;

	private _check$$ = new Subject<void>();

	_cdr: ChangeDetectorRef = inject(ChangeDetectorRef);
	constructor() {
		this._check$$
			.pipe(
				//
				throttleTime(50, undefined, { leading: true, trailing: true })
			)
			.subscribe(() => {
				if (DEBUG || this.debug) console.log('%c[' + this.constructor.name + '] check called', 'color:lightgreen', this.checkCalledCount++);

				// this._cdr.markForCheck();
				this._markForCheck();
			});
	}

	_cdr_setDebug(debug: boolean) {
		this.debug = debug;
	}

	_check() {
		if (DEBUG || this.debug) console.log('%c[' + this.constructor.name + '] check asked', 'color:lightgreen', this.checkAskedCount++);
		// this._cdr.markForCheck();
		this._check$$.next();
	}

	_checkNow() {
		if (DEBUG || this.debug) console.log('%c[' + this.constructor.name + '] check now asked', 'color:lightgreen');
		this._detectChanges();
	}

	/** Mark the component as dirty (and its parents) */
	_markForCheck() {
		if (DEBUG || this.debug) console.log('%c[' + this.constructor.name + '] markForCheck asked', 'color:lightgreen');
		this._cdr.markForCheck();
		if (DEBUG || this.debug) console.log('%c[' + this.constructor.name + '] markForCheck called', 'color:lightgreen');
	}

	/**
	 * Force the change detection on the component (and its children)
	 */
	_detectChanges() {
		if (DEBUG || this.debug) console.log('%c[' + this.constructor.name + '] detectChanges called', 'color:lightgreen', this.detectChanges++);
		if (this._componentLoaded) this._cdr.detectChanges();
	}

	checked() {
		if (DEBUG || DEBUG_CHECKED) console.log('%c[' + this.constructor.name + '] checked', 'color:lightgreen', this.checkedCount++);
	}

	_detach() {
		this._cdr.detach();
	}

	_attach() {
		this._cdr.reattach();
	}

	_cdr_logThis(name: string, data: any) {
		if (DEBUG || this.debug) console.log('%c[' + name + '](logThis) ' + JSON.stringify(data), 'color: purple; font-weight: bold');
	}

	ngOnInit() {
		this._componentLoaded = true;
	}
}
