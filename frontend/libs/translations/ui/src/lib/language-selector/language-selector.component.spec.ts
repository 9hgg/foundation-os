import { TestBed } from '@angular/core/testing';
import { TranslationService } from '@foundation/translations/services';
import { LanguageSelectorComponent } from './language-selector.component';

const translationServiceMock = { useLanguage: vi.fn() };

describe('LanguageSelectorComponent', () => {
	let component: LanguageSelectorComponent;

	beforeEach(async () => {
		vi.clearAllMocks();
		await TestBed.configureTestingModule({
			imports: [LanguageSelectorComponent],
			providers: [{ provide: TranslationService, useValue: translationServiceMock }],
		})
			.overrideComponent(LanguageSelectorComponent, { set: { template: '' } })
			.compileComponents();
		const fixture = TestBed.createComponent(LanguageSelectorComponent);
		component = fixture.componentInstance;
	});

	it('exposes 5 languages', () => {
		expect(component.languages).toHaveLength(5);
	});

	it('includes English, French, Spanish, Italian, German', () => {
		const codes = component.languages.map((l) => l.code);
		expect(codes).toContain('en');
		expect(codes).toContain('fr');
		expect(codes).toContain('es');
		expect(codes).toContain('it');
		expect(codes).toContain('de');
	});

	it('setLanguage delegates to translationService.useLanguage', () => {
		component.setLanguage('fr');
		expect(translationServiceMock.useLanguage).toHaveBeenCalledWith('fr');
	});

	it('has the lib-language-selector selector', () => {
		const cmp = LanguageSelectorComponent as { ɵcmp?: { selectors: string[][] } };
		const selector = cmp.ɵcmp?.selectors?.[0]?.[0];
		expect(selector).toBe('lib-language-selector');
	});
});
