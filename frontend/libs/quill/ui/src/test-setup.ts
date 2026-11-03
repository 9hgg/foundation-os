import '@analogjs/vite-plugin-angular/setup-vitest';

import { getTestBed } from '@angular/core/testing';
import { BrowserDynamicTestingModule, platformBrowserDynamicTesting } from '@angular/platform-browser-dynamic/testing';

try {
	getTestBed().initTestEnvironment(BrowserDynamicTestingModule, platformBrowserDynamicTesting());
} catch {
	// Nx can reuse worker processes across different projects' test tasks — TestBed's
	// init state is a module-level singleton on @angular/core/testing, so a second
	// project's setup running in a reused process throws "Cannot set base providers
	// because it has already been called" instead of a clean per-project environment.
	// Reset + reinit rather than crash.
	getTestBed().resetTestEnvironment();
	getTestBed().initTestEnvironment(BrowserDynamicTestingModule, platformBrowserDynamicTesting());
}

// A worker that reused its environment (see above) also loses Angular's own
// one-time-registered automatic per-test TestBed reset, so make it explicit
// instead of relying on that implicit registration.
afterEach(() => {
	getTestBed().resetTestingModule();
});
