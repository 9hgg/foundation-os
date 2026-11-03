import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { TranslationService } from '@foundation/translations/services';
import { LeoparLandingPageComponent } from './leopar-landing-page.component';

describe('LeoparLandingPageComponent', () => {
	let fixture: ComponentFixture<LeoparLandingPageComponent>;
	let component: LeoparLandingPageComponent;
	const currentLangCode$$$ = of('fr');

	beforeEach(async () => {
		await TestBed.configureTestingModule({
			imports: [LeoparLandingPageComponent],
			providers: [provideRouter([]), { provide: TranslationService, useValue: { currentLangCode$$$ } }],
			schemas: [NO_ERRORS_SCHEMA],
		})
			.overrideComponent(LeoparLandingPageComponent, { set: { imports: [], template: '' } })
			.compileComponents();

		fixture = TestBed.createComponent(LeoparLandingPageComponent);
		component = fixture.componentInstance;
	});

	it('creates the component', () => {
		expect(component).toBeTruthy();
		expect(() => fixture.detectChanges()).not.toThrow();
	});

	it('exposes the injected TranslationService current language stream verbatim', () => {
		expect(component.currentLangCode$$$).toBe(currentLangCode$$$);
	});
});
