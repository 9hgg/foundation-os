import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TranslatePipe, TranslateDirective } from './translation.pipe';
import { TranslationService } from './translation.service';
import { BehaviorSubject, of } from 'rxjs';

describe('TranslatePipe', () => {
	let pipe: TranslatePipe;
	let translationServiceMock: { translate$: ReturnType<typeof vi.fn> };

	beforeEach(() => {
		translationServiceMock = {
			translate$: vi.fn().mockReturnValue(of('Translated Sentence')),
		};
		TestBed.configureTestingModule({
			providers: [TranslatePipe, { provide: TranslationService, useValue: translationServiceMock }],
		});
		pipe = TestBed.inject(TranslatePipe);
	});

	it('create an instance', () => {
		expect(pipe).toBeTruthy();
	});

	it('should transform input sentence', () => {
		pipe.transform('Hello').subscribe((res) => {
			expect(res).toBe('Translated Sentence');
			expect(translationServiceMock.translate$).toHaveBeenCalledWith({
				inputSentence: 'Hello',
				inputLanguage: 'en',
				kv: undefined,
				rpbt: false,
				translationContext: undefined,
			});
		});
	});

	it('should pass kv to translate$', () => {
		pipe.transform('Hello §name', { name: 'Bob' }).subscribe();
		expect(translationServiceMock.translate$).toHaveBeenCalledWith(
			expect.objectContaining({
				inputSentence: 'Hello §name',
				kv: { name: 'Bob' },
			})
		);
	});

	it('should pass rpbt flag to translate$', () => {
		pipe.transform('Hello', undefined, true).subscribe();
		expect(translationServiceMock.translate$).toHaveBeenCalledWith(
			expect.objectContaining({
				rpbt: true,
			})
		);
	});

	it('should pass translationContext to translate$', () => {
		pipe.transform('Open', undefined, false, 'button').subscribe();
		expect(translationServiceMock.translate$).toHaveBeenCalledWith(
			expect.objectContaining({
				translationContext: 'button',
			})
		);
	});
});

describe('TranslateDirective', () => {
	let translationServiceMock: {
		translate$: ReturnType<typeof vi.fn>;
		currentLangCode$$$: { $: BehaviorSubject<string> };
	};

	@Component({
		template: `<span [translate]="undefined">Hello World</span>`,
		imports: [TranslateDirective],
	})
	class TestHostComponent {}

	beforeEach(() => {
		const langSubject = new BehaviorSubject('en');
		translationServiceMock = {
			translate$: vi.fn().mockReturnValue(of('Bonjour le monde')),
			currentLangCode$$$: { $: langSubject },
		};

		TestBed.configureTestingModule({
			imports: [TestHostComponent],
			providers: [{ provide: TranslationService, useValue: translationServiceMock }],
		});
	});

	it('should create the directive via host component', () => {
		const fixture = TestBed.createComponent(TestHostComponent);
		fixture.detectChanges();
		const spanEl = fixture.nativeElement.querySelector('span');
		expect(spanEl).toBeTruthy();
	});

	it('should call translate$ with element innerHTML', () => {
		const fixture = TestBed.createComponent(TestHostComponent);
		fixture.detectChanges();

		expect(translationServiceMock.translate$).toHaveBeenCalledWith(
			expect.objectContaining({
				inputSentence: 'Hello World',
				inputLanguage: 'en',
			})
		);
	});

	it('should update element innerHTML with translated text', () => {
		const fixture = TestBed.createComponent(TestHostComponent);
		fixture.detectChanges();
		const spanEl = fixture.nativeElement.querySelector('span');
		expect(spanEl.innerHTML).toBe('Bonjour le monde');
	});
});
