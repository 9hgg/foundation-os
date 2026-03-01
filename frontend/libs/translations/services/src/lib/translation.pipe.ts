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

	transform(inputSentence: string, kv?: { [key: string]: any }, rpbt: boolean = false, translationContext?: string) {
		// return of(inputSentence);
		return this._translationService.translate$({
			inputSentence,
			inputLanguage: 'en',
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
					element.innerHTML = translation;
					this._cdr.detectChanges();
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
