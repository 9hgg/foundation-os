import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { of } from 'rxjs';
import { vi, beforeEach, describe, expect, it } from 'vitest';
import { AppConfigService } from '@foundation/app/config';
import { RequestService } from '@foundation/network/services';
import { UsersRepository } from '@foundation/users/state';
import { LayoutService } from '../layout.service';
import { ThemeSelectorFlatComponent } from './theme-selector-flat.component';

describe('theme-selector-flat.component', () => {
	let component: ThemeSelectorFlatComponent;
	let fixture: ComponentFixture<ThemeSelectorFlatComponent>;
	let layoutServiceMock: {
		mode: ReturnType<typeof signal<'light' | 'dark' | 'system'>>;
		effectiveMode: ReturnType<typeof signal<'light' | 'dark'>>;
		lightThemePref: ReturnType<typeof signal<string>>;
		darkThemePref: ReturnType<typeof signal<string>>;
		setMode: ReturnType<typeof vi.fn>;
		updateLightTheme: ReturnType<typeof vi.fn>;
		updateDarkTheme: ReturnType<typeof vi.fn>;
		setLightThemePref: ReturnType<typeof vi.fn>;
		setDarkThemePref: ReturnType<typeof vi.fn>;
	};
	let usersRepositoryMock: {
		currentProfile: ReturnType<typeof vi.fn>;
		refreshUsers: ReturnType<typeof vi.fn>;
	};
	let requestServiceMock: {
		post$: ReturnType<typeof vi.fn>;
	};

	beforeEach(async () => {
		layoutServiceMock = {
			mode: signal<'light' | 'dark' | 'system'>('system'),
			effectiveMode: signal<'light' | 'dark'>('light'),
			lightThemePref: signal('light'),
			darkThemePref: signal('dark'),
			setMode: vi.fn(),
			updateLightTheme: vi.fn(),
			updateDarkTheme: vi.fn(),
			setLightThemePref: vi.fn(),
			setDarkThemePref: vi.fn(),
		};
		usersRepositoryMock = {
			currentProfile: vi.fn().mockReturnValue(null),
			refreshUsers: vi.fn(),
		};
		requestServiceMock = {
			post$: vi.fn().mockReturnValue(of({})),
		};

		await TestBed.configureTestingModule({
			imports: [ThemeSelectorFlatComponent],
			providers: [
				{
					provide: AppConfigService,
					useValue: {
						config$_: {
							environment: {
								availableThemes: ['light', 'dark', 'accessible'],
							},
						},
					},
				},
				{
					provide: LayoutService,
					useValue: layoutServiceMock,
				},
				{
					provide: UsersRepository,
					useValue: usersRepositoryMock,
				},
				{
					provide: RequestService,
					useValue: requestServiceMock,
				},
			],
		}).compileComponents();

		fixture = TestBed.createComponent(ThemeSelectorFlatComponent);
		component = fixture.componentInstance;
		fixture.detectChanges();
	});

	it('should expose the accessibility theme from app config', () => {
		expect(component.themes).toContain('accessible');
	});

	it('should render screen-reader labels for theme menus', () => {
		const themeMenuButtons = Array.from(
			fixture.nativeElement.querySelectorAll('button[aria-label]')
		).map((button: Element) => button.getAttribute('aria-label'));

		expect(themeMenuButtons).toContain('Choose light theme');
		expect(themeMenuButtons).toContain('Choose dark theme');
	});

	it('sets mode and skips remote sync without a current user', () => {
		component.setMode('dark');

		expect(layoutServiceMock.setMode).toHaveBeenCalledWith('dark');
		expect(requestServiceMock.post$).not.toHaveBeenCalled();
	});

	it('sets mode and syncs theme config for the current user', () => {
		usersRepositoryMock.currentProfile.mockReturnValue({ config: { theme: { light: 'light' } } });

		component.setMode('system', { dark: 'dracula' });

		expect(requestServiceMock.post$).toHaveBeenCalledWith('/api/users/profile/update', {
			config: { theme: { light: 'light', mode: 'system', dark: 'dracula' } },
		});
		expect(usersRepositoryMock.refreshUsers).toHaveBeenCalled();
	});

	it('updates the active light theme preference without forcing light mode', () => {
		layoutServiceMock.effectiveMode.set('light');
		usersRepositoryMock.currentProfile.mockReturnValue({ config: { theme: {} } });

		component.updateLightTheme('corporate');

		expect(layoutServiceMock.setLightThemePref).toHaveBeenCalledWith('corporate');
		expect(layoutServiceMock.updateLightTheme).not.toHaveBeenCalled();
		expect(requestServiceMock.post$).toHaveBeenCalledWith('/api/users/profile/update', {
			config: { theme: { light: 'corporate' } },
		});
	});

	it('updates inactive light theme by switching to light mode', () => {
		layoutServiceMock.effectiveMode.set('dark');

		component.updateLightTheme('corporate');

		expect(layoutServiceMock.updateLightTheme).toHaveBeenCalledWith('corporate');
		expect(layoutServiceMock.setLightThemePref).not.toHaveBeenCalled();
	});

	it('updates the active dark theme preference without forcing dark mode', () => {
		layoutServiceMock.effectiveMode.set('dark');
		usersRepositoryMock.currentProfile.mockReturnValue({ config: { theme: {} } });

		component.updateDarkTheme('dracula');

		expect(layoutServiceMock.setDarkThemePref).toHaveBeenCalledWith('dracula');
		expect(layoutServiceMock.updateDarkTheme).not.toHaveBeenCalled();
		expect(requestServiceMock.post$).toHaveBeenCalledWith('/api/users/profile/update', {
			config: { theme: { dark: 'dracula' } },
		});
	});

	it('updates inactive dark theme by switching to dark mode', () => {
		layoutServiceMock.effectiveMode.set('light');

		component.updateDarkTheme('dracula');

		expect(layoutServiceMock.updateDarkTheme).toHaveBeenCalledWith('dracula');
		expect(layoutServiceMock.setDarkThemePref).not.toHaveBeenCalled();
	});
});
