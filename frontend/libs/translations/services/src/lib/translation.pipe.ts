import { ChangeDetectorRef, Directive, ElementRef, inject, Input, OnInit, Pipe, PipeTransform } from '@angular/core';
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
	@Input('translate') kv?: { [key: string]: any } = {};
	@Input() rpbt: boolean = false;
	@Input() translationContext?: string;

	translation$$$ = new BehaviorSubjectReplayed<string | null>(null);

	constructor(
		private _cdr: ChangeDetectorRef,
		private _elementRef: ElementRef<HTMLElement>,
		private _translationService: TranslationService
	) {
		this.translation$$$
			.pipe(
				// debounceTime(1000),
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
		const element = this._elementRef.nativeElement;
		const originalText = element.innerHTML;
		if (DEBUG) {
			console.log('translation asked for:', originalText, 'CONTEXT:', this.translationContext);
		}
		this.translation$$$.setSource(
			this._translationService.translate$({
				inputSentence: originalText,
				kv: this.kv,
				rpbt: this.rpbt,
				translationContext: this.translationContext,
			})
		);
	}
}
