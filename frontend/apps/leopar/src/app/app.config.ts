import { AuthTokenInterceptor } from '@foundation/auth/state';
import { OfflineInterceptor } from '@foundation/network/interceptors';
import { CacheInterceptor } from '@foundation/utils';
import { Dialog, DialogModule } from '@angular/cdk/dialog';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { ApplicationConfig, ErrorHandler, importProvidersFrom, inject, provideAppInitializer, provideZonelessChangeDetection } from '@angular/core';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { provideRouter, Router, withComponentInputBinding, withEnabledBlockingInitialNavigation, withRouterConfig } from '@angular/router';
import * as Sentry from '@sentry/angular';
import { environment } from '../environments/environment';
import { appRoutes } from './app.routes.config';
import { setBackendPort } from '@foundation/network/services';

if (environment.api?.port) {
	setBackendPort(environment.api.port);
}

export const appConfig: ApplicationConfig = {
	providers: [
		provideZonelessChangeDetection(),
		provideRouter(
			//
			appRoutes,
			withEnabledBlockingInitialNavigation(),
			withComponentInputBinding(),
			withRouterConfig({
				paramsInheritanceStrategy: 'always',
			})
		),
		provideHttpClient(
			withInterceptors([
				AuthTokenInterceptor,
				CacheInterceptor,
				...(environment.production ? [OfflineInterceptor] : []), // Ensure this is imported from the correct path
				// RedirectInterceptor
			])
		),
		Dialog, // used in define path modal
		importProvidersFrom(DialogModule),
		importProvidersFrom(BrowserAnimationsModule),
	],
};

if (environment.sentry.domain && environment.production && window.origin.includes(environment.sentry.domain)) {
	appConfig.providers.push(
		{
			provide: ErrorHandler,
			useValue: Sentry.createErrorHandler(),
		},
		{
			provide: Sentry.TraceService,
			deps: [Router],
		},
		provideAppInitializer(() => {
			inject(Sentry.TraceService);
			// deps: [Sentry.TraceService],
			// multi: true,
		})
	);
}
