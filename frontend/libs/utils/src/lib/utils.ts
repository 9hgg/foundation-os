import { cloneDeep } from 'lodash-es';
import { BehaviorSubject, EMPTY, NEVER, Observable, Subject, Subscription, filter, finalize, from, isObservable, of, shareReplay, startWith, switchMap, take, tap } from 'rxjs';
import { isEqual } from './equal.utils';

export type AttrElement = string[] | string | number | boolean | undefined | null;

export type Attr = {
	[key: string]: AttrElement;
};

export function anyToObservable<T>(value: T | Observable<T> | Promise<T>) {
	//obs?
	if (isObservable(value)) {
		return value;
	}

	//async?
	if (value instanceof Promise) {
		return from(value);
	}

	//sync?
	return of(value);
}

/**
 * A BehaviorSubject that replays the last value to new subscribers
 * and filters out the same value
 * @param initialValue The initial value of the BehaviorSubject
 * @param title The title of the BehaviorSubject (for debugging purposes)
 * @param bufferSize The number of values to buffer (default: 1)
 * @param refCount Whether to refCount the BehaviorSubject (default: false)
 * @returns A BehaviorSubject that replays the last value to new subscribers
 * and filters out the same value.
 *
 * Usage:
 * ```ts
 * const subject = new BehaviorSubjectReplayed<number>(0, 'mySubject');
 * // an obsersable
 * subject.$
 * // a BehaviorSubject
 * subject.$$
 * // the value of the BehaviorSubject
 * subject.value
 * ```
 */
export class BehaviorSubjectReplayed<T> {
	$: Observable<T>;
	private $$: BehaviorSubject<T>;
	private _value: T;
	public get value(): T {
		return cloneDeep(this._value);
	}
	public set value(value: T) {
		this.next(value);
	}

	filterValue: T;

	firstEmissionDone = false;
	title: string | undefined;

	filterCount = 0;

	replaySubject$$ = new Subject<void>();

	// proxies for $
	pipe;
	subscribe;
	toPromise;
	complete;

	constructor(initialValue: T, title?: string, bufferSize = 1, refCount = false) {
		this._value = initialValue;
		this.filterValue = initialValue;

		this.title = title;
		this.$$ = new BehaviorSubject<T>(initialValue);
		this.$ = this.$$.pipe(
			filter((newValue) => {
				const equal = isEqual(this.filterValue, newValue);
				if (title)
					console.log('%c[BehaviorSubjectReplayed] $ filter called', 'color:goldenrod', this.filterCount++, {
						title: this.title,
						value: this.value,
						newValue,
						equal,
						firstEmissionDone: this.firstEmissionDone,
					});
				return !equal || !this.firstEmissionDone;
			}),
			switchMap((newValue) => {
				return this.replaySubject$$.pipe(
					switchMap(() => {
						// console.log('%c[BehaviorSubjectReplayed] $ replaySubject$$.pipe', 'color:goldenrod');
						return of(newValue);
					}),
					startWith(newValue)
				);
			}),
			tap((value) => {
				if (title) console.log('[BehaviorSubjectReplayed] $ value', '(' + title + ')', value);
				this.filterValue = value;
				this.firstEmissionDone = true;
			}),
			shareReplay({
				bufferSize,
				refCount,
			}),
			// throttleTime(1, undefined, { leading: false, trailing: true }),
			finalize(() => {
				if (title)
					console.log('%c[BehaviorSubjectReplayed] $ 🛑 finalize called', 'color:goldenrod', '(' + title + ')', {
						value: this.value,
					});
			})
		);

		this.pipe = this.$.pipe.bind(this.$);
		this.subscribe = this.$.subscribe.bind(this.$);
		this.toPromise = this.$.toPromise.bind(this.$);
		this.complete = this.$$.complete.bind(this.$$);

		if (title) console.log('[BehaviorSubjectReplayed] initial value', '(' + title + ')', this.value);
	}

	next(value: T) {
		this._value = value;
		this.$$.next(value);

		this.callbacks.forEach((callback) => {
			// if (this.title)
			console.log('%c[BehaviorSubjectReplayed] $ calling callback', 'color:goldenrod', '(' + this.title + ')', {
				callback,
				value,
			});

			callback(value);
		});
	}

	callbacks: ((value: T) => void)[] = [];
	callback(callback: (value: T) => void) {
		this.callbacks.push(callback);
	}
	clearCallbacks() {
		this.callbacks = [];
	}

	clone() {
		return cloneDeep(this.value);
	}

	sourceSubscription: Subscription | undefined;
	source$$ = new BehaviorSubject<Observable<T> | null>(null);
	setSource(obs: Observable<T>, subscribe: boolean = true) {
		// if (this.title)

		if (this.sourceSubscription) {
			// console.warn('%c[BehaviorSubjectReplayed](setSource) obs', 'color:goldenrod', '(' + this.title + ')', obs);
			this.sourceSubscription.unsubscribe();
			this.sourceSubscription = undefined;
		}
		this.source$$.next(obs);

		if (subscribe) {
			this.subscribeToSource();
		}
	}

	/** Can be called so that the source observable can fill the value
	 *
	 * Only needed if setSource is called with subscribe = false
	 */
	subscribeToSource() {
		if (!this.sourceSubscription) {
			this.sourceSubscription = this.source$$
				.pipe(
					switchMap((obs) => {
						if (!obs) return NEVER;
						return obs;
					}),
					tap((valueFromSource) => {
						if (this.title) console.log('%c[BehaviorSubjectReplayed](sourceSubscription) valueFromSource', 'color:goldenrod', '(' + this.title + ')', valueFromSource);
						this.next(valueFromSource);
					}),
					finalize(() => {
						if (this.title)
							console.log('%c[BehaviorSubjectReplayed](sourceSubscription) finalize', 'color:goldenrod', '(' + this.title + ')', {
								value: this.value,
							});
					})
				)
				.subscribe();
		} else {
			throw 'Already subscribed to source';
		}
	}

	destructor() {
		if (this.title)
			console.log('%c[BehaviorSubjectReplayed] destructor CALLED', 'color:goldenrod', '(' + this.title + ')', {
				value: this.value,
				$$: this.$$,
				$: this.$,
				sourceSubscription: this.sourceSubscription,
				source$$: this.source$$,
			});
		this.$$.complete();
		this.source$$.next(EMPTY);
		this.sourceSubscription?.unsubscribe();
	}

	getOne$(callback?: (value: T) => void) {
		return this.$.pipe(
			take(1),
			tap((value) => callback?.(value))
		);
	}

	/**
	 * Emits the value (useful when modifying object directly without using next)
	 */
	forceReplay() {
		this.replaySubject$$.next();
	}
}

/**
 * Perfect use case -> id:I=>Observable:T
 * To be used when you want a reactive value but the setter is something else
 * (eg. you want a Folder but you have the folderId)
 */
export class BehaviorSubjectReplayedProxied<I, T> {
	// subject$ = new Subject<I>();
	$$$: BehaviorSubjectReplayed<T | null>;
	buildObservable: (arg: I) => Observable<T | null>;

	// proxies for $$$
	pipe;
	subscribe;
	toPromise;
	$;

	constructor(
		//
		buildObservable: (arg: I) => Observable<T | null>,
		initialValue: T,
		title?: string,
		bufferSize = 1
	) {
		this.$$$ = new BehaviorSubjectReplayed<T | null>(initialValue, title, bufferSize);
		this.buildObservable = buildObservable;

		this.pipe = this.$$$.pipe.bind(this.$$$);
		this.subscribe = this.$$$.subscribe.bind(this.$$$);
		this.toPromise = this.$$$.toPromise.bind(this.$$$);

		this.$ = this.$$$.$;
	}

	next(newInput: I) {
		if (this.$$$.title) console.log('[BehaviorSubjectReplayedProxied] next', '(' + this.$$$.title + ')', newInput);

		const a = this.buildObservable(newInput);
		this.$$$.setSource(a, true);
	}

	get value() {
		return this.$$$.value;
	}

	forceReplay() {
		this.$$$.forceReplay();
	}

	destructor() {
		this.$$$.destructor();
	}
}

export function BehaviorSubjectReplayedFromObs<T>(initialValue: T, obs: Observable<T>, title?: string, bufferSize = 1) {
	// console.warn('BehaviorSubjectReplayedFromObs is not unsubscribing from obs');
	const a = new BehaviorSubjectReplayed<T>(initialValue, title, bufferSize);
	a.next(initialValue);
	a.setSource(obs);
	// obs.subscribe((value) => {
	// 	a.next(value);
	// });
	return a;
}
