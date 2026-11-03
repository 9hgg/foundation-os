import { ChangeDetectorRef, Directive, ElementRef, effect, inject, input, OnInit, Pipe, PipeTransform, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslationService } from './translation.service';
import { BehaviorSubjectReplayed } from '@foundation/utils';
import { finalize, tap } from 'rxjs';

const DEBUG = false;

@Pipe({
	name: 'translate',
	standalone: true,
})
export class TranslatePipe implements PipeTransform {
	_translationService = inject(TranslationService);

	transform(inputSentence: string, kv?: { [key: string]: any }, rpbt: boolean = false, translationContext?: string, inputLanguage: string = 'en') {
		// return of(inputSentence);
		return this._translationService.translate$({
			inputSentence,
			inputLanguage,
			kv,
			rpbt,
			translationContext,
		});
	}
}

@Directive({
	// eslint-disable-next-line @angular-eslint/directive-selector
	selector: '[translate]',
	standalone: true,
})
export class TranslateDirective implements OnInit {
	kv = input<{ [key: string]: any } | undefined>(undefined, { alias: 'translate' });
	rpbt = input<boolean>(false);
	translationContext = input<string | undefined>(undefined);
	inputLanguage = input<string>('en');

	translation$$$ = new BehaviorSubjectReplayed<string | null>(null);
	private _originalText = signal<string>('');

	private _cdr = inject(ChangeDetectorRef);
	private _elementRef = inject(ElementRef<HTMLElement>);
	private _translationService = inject(TranslationService);

	constructor() {
		effect(() => {
			const originalText = this._originalText();
			if (!originalText) return;

			this.translation$$$.setSource(
				this._translationService.translate$({
					inputSentence: originalText,
					kv: this.kv(),
					rpbt: this.rpbt(),
					translationContext: this.translationContext(),
					inputLanguage: this.inputLanguage(),
				})
			);
		});

		this.translation$$$
			.pipe(
				takeUntilDestroyed(),
				tap((translation) => {
					if (!translation) return;
					const element = this._elementRef?.nativeElement;
					if (!element) return;
					// translate$() can emit synchronously (cached translation -> of(...)).
					// Calling detectChanges() from within that synchronous emission, while
					// Angular may still be in the middle of instantiating/rendering the
					// current view, makes this directive re-enter change detection —
					// which can construct further [translate] directives that do the same,
					// recursing until the stack overflows on pages with many of them (e.g.
					// per-row translated badges/buttons in a table). Deferring the DOM
					// write + detectChanges to a microtask breaks that synchronous chain.
					queueMicrotask(() => {
						element.innerHTML = translation;
						this._cdr.detectChanges();
					});
				}),
				finalize(() => {
					this.translation$$$.destructor();
				})
			)
			.subscribe();
	}

	ngOnInit(): void {
		const originalText = this._elementRef.nativeElement.innerHTML;
		if (DEBUG) console.log('translation asked for:', originalText, 'CONTEXT:', this.translationContext());
		this._originalText.set(originalText);
	}
}
