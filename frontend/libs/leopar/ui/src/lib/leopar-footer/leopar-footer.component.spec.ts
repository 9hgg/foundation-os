import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { LeoparFooterComponent } from './leopar-footer.component';
import { AppConfigService } from '@foundation/app/config';
import { LayoutService } from '@foundation/app/layout';
import { RequestService } from '@foundation/network/services';
import { UsersRepository } from '@foundation/users/state';
import { RouterModule } from '@angular/router';
import { TranslationService } from '@foundation/translations/services';

import { signal } from '@angular/core';

const mockLayoutService = {
	mode: signal<'light' | 'dark' | 'system'>('light'),
	lightThemePref: signal<string>('light'),
	darkThemePref: signal<string>('dark'),
	effectiveMode: signal<'light' | 'dark'>('light'),
	systemPref: signal<'light' | 'dark'>('light'),
	setMode: vi.fn(),
	updateLightTheme: vi.fn(),
	updateDarkTheme: vi.fn(),
};

const mockUsersRepository = {
	currentProfile: vi.fn().mockReturnValue(null),
	refreshUsers: vi.fn(),
};

const mockRequestService = {
	post$: vi.fn().mockReturnValue(of({ result: null })),
};

const mockAppConfig = {
	config$_: {
		environment: {
			availableThemes: ['light', 'dark'],
		},
	},
};

describe('LeoparFooterComponent', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		TestBed.configureTestingModule({
			imports: [LeoparFooterComponent, RouterModule.forRoot([])],
			providers: [
				{ provide: LayoutService, useValue: mockLayoutService },
				{ provide: UsersRepository, useValue: mockUsersRepository },
				{ provide: RequestService, useValue: mockRequestService },
				{ provide: AppConfigService, useValue: mockAppConfig },
				{ provide: TranslationService, useValue: { prep: vi.fn().mockReturnValue(() => 'translated'), instant: vi.fn().mockReturnValue('translated'), translate$: vi.fn().mockReturnValue(of('translated')), useLanguage: vi.fn(), currentLanguage$: of('en') } },
			],
		});
	});

	it('creates', () => {
		const fixture = TestBed.createComponent(LeoparFooterComponent);
		fixture.detectChanges();
		expect(fixture.componentInstance).toBeTruthy();
	});

	it('has current year', () => {
		const fixture = TestBed.createComponent(LeoparFooterComponent);
		const component = fixture.componentInstance;
		expect(component.currentYear).toBe(new Date().getFullYear());
	});

	it('returns themes from config', () => {
		const fixture = TestBed.createComponent(LeoparFooterComponent);
		const component = fixture.componentInstance;
		expect(component.themes).toEqual(['light', 'dark']);
	});

	it('calls setMode on layoutService', () => {
		const fixture = TestBed.createComponent(LeoparFooterComponent);
		const component = fixture.componentInstance;
		fixture.detectChanges();
		component.setMode('dark');
		expect(mockLayoutService.setMode).toHaveBeenCalledWith('dark');
	});

	it('does not call post$ when no user', () => {
		mockUsersRepository.currentProfile.mockReturnValue(null);
		const fixture = TestBed.createComponent(LeoparFooterComponent);
		const component = fixture.componentInstance;
		fixture.detectChanges();
		component.setMode('dark');
		expect(mockRequestService.post$).not.toHaveBeenCalled();
	});

	it('calls updateLightTheme on layoutService', () => {
		const fixture = TestBed.createComponent(LeoparFooterComponent);
		const component = fixture.componentInstance;
		fixture.detectChanges();
		component.updateLightTheme('emerald');
		expect(mockLayoutService.updateLightTheme).toHaveBeenCalledWith('emerald');
	});

	it('calls updateDarkTheme on layoutService', () => {
		const fixture = TestBed.createComponent(LeoparFooterComponent);
		const component = fixture.componentInstance;
		fixture.detectChanges();
		component.updateDarkTheme('night');
		expect(mockLayoutService.updateDarkTheme).toHaveBeenCalledWith('night');
	});
});
