import { TestBed } from '@angular/core/testing';
import { AppConfigService } from '@foundation/app/config';
import { SupportPageComponent } from './support-page.component';

describe('SupportPageComponent', () => {
	it('exposes the injected app config service and the browser window verbatim', () => {
		const appConfigService = { config$: { environment: { support: { email: 'support@example.test' } } } };
		TestBed.configureTestingModule({ providers: [{ provide: AppConfigService, useValue: appConfigService }] });

		const component = TestBed.runInInjectionContext(() => new SupportPageComponent());

		expect(component.appConfigService).toBe(appConfigService);
		expect(component.window).toBe(window);
	});
});
