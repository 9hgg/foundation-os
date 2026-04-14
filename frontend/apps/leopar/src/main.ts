import { DEFAULT_BACKEND_URL } from '@foundation/network/services';
import { bootstrapApplication } from '@angular/platform-browser';
import * as Sentry from '@sentry/angular';
import { fromEvent } from 'rxjs';
import { AppComponent } from './app/app.component';
import { appConfig } from './app/app.config';
import { environment } from './environments/environment';

if (environment.production && environment.sentry.domain && window.origin.includes(environment.sentry.domain)) {
	Sentry.init(environment.sentry.initConfig ?? {});
}


if (window.origin.includes('localhost:42')) {
	console.log('Running on localhost, fetching data without WithCredentials to get first cookie');
	fetch(DEFAULT_BACKEND_URL + '/test-api/stateless?' + Math.random()).then((response) => {
		console.log('\tResponse from basic fetch', response);
		response.headers.forEach((value, name) => {
			console.log('\tResponse from basic fetch: header', `${name}: ${value}`);
		});
	});
}


if (!environment.production) console.log('Environment', environment);

bootstrapApplication(AppComponent, appConfig).catch((err) => console.error(err));
