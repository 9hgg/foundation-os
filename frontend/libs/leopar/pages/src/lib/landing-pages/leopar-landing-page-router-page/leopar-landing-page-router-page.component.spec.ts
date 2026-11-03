import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { provideRouter } from '@angular/router';
import { LeoparLandingPageRouterPageComponent } from './leopar-landing-page-router-page.component';

// A pure layout shell (header + router-outlet + footer, no logic of its own); the header and
// footer components each have their own spec in @leopar/ui, so this just confirms the shell
// assembles without error.
describe('LeoparLandingPageRouterPageComponent', () => {
	let fixture: ComponentFixture<LeoparLandingPageRouterPageComponent>;

	beforeEach(async () => {
		await TestBed.configureTestingModule({
			imports: [LeoparLandingPageRouterPageComponent],
			providers: [provideRouter([])],
			schemas: [NO_ERRORS_SCHEMA],
		})
			.overrideComponent(LeoparLandingPageRouterPageComponent, { set: { imports: [], template: '' } })
			.compileComponents();

		fixture = TestBed.createComponent(LeoparLandingPageRouterPageComponent);
	});

	it('creates the component', () => {
		expect(fixture.componentInstance).toBeTruthy();
		expect(() => fixture.detectChanges()).not.toThrow();
	});
});
