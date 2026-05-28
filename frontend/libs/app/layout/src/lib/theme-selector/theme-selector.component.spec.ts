import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { BehaviorSubject, of } from 'rxjs';
import { AppConfigService } from '@foundation/app/config';
import { TranslationService } from '@foundation/translations/services';
import { LayoutService } from '../layout.service';
import { ThemeSelectorComponent } from './theme-selector.component';

describe('theme-selector.component', () => {
	let component: ThemeSelectorComponent;
	let fixture: ComponentFixture<ThemeSelectorComponent>;
	let layoutServiceMock: {
		mode: ReturnType<typeof signal<'light' | 'dark' | 'system'>>;
		effectiveMode: ReturnType<typeof signal<'light' | 'dark'>>;
		lightThemePref: ReturnType<typeof signal<string>>;
		darkThemePref: ReturnType<typeof signal<string>>;
		setMode: ReturnType<typeof vi.fn>;
		updateLightTheme: ReturnType<typeof vi.fn>;
		updateDarkTheme: ReturnType<typeof vi.fn>;
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
		};

		await TestBed.configureTestingModule({
			imports: [ThemeSelectorComponent],
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
				{ provide: LayoutService, useValue: layoutServiceMock },
				{
					provide: TranslationService,
					useValue: {
						currentLangCode$$$: { $: new BehaviorSubject('en') },
						translate$: vi.fn((translationRequest) => of(translationRequest.inputSentence)),
					},
				},
			],
		}).compileComponents();

		fixture = TestBed.createComponent(ThemeSelectorComponent);
		component = fixture.componentInstance;
		fixture.detectChanges();
	});

	it('exposes themes from app config', () => {
		expect(component.themes).toEqual(['light', 'dark', 'accessible']);
	});

	it('sets mode and emits the theme change', () => {
		const emittedChanges: unknown[] = [];
		component.themeChange.subscribe((changes) => emittedChanges.push(changes));

		component.setMode('dark');

		expect(layoutServiceMock.setMode).toHaveBeenCalledWith('dark');
		expect(emittedChanges).toEqual([{ mode: 'dark' }]);
	});

	it('updates the light theme and emits light mode config', () => {
		const emittedChanges: unknown[] = [];
		component.themeChange.subscribe((changes) => emittedChanges.push(changes));

		component.updateLightTheme('corporate');

		expect(layoutServiceMock.updateLightTheme).toHaveBeenCalledWith('corporate');
		expect(emittedChanges).toEqual([{ mode: 'light', light: 'corporate' }]);
	});

	it('updates the dark theme and emits dark mode config', () => {
		const emittedChanges: unknown[] = [];
		component.themeChange.subscribe((changes) => emittedChanges.push(changes));

		component.updateDarkTheme('dracula');

		expect(layoutServiceMock.updateDarkTheme).toHaveBeenCalledWith('dracula');
		expect(emittedChanges).toEqual([{ mode: 'dark', dark: 'dracula' }]);
	});

	it('renders the mode controls', () => {
		const buttons = Array.from(fixture.nativeElement.querySelectorAll('button'));

		expect(buttons.length).toBeGreaterThanOrEqual(3);
		expect(fixture.nativeElement.textContent).toContain('Light');
		expect(fixture.nativeElement.textContent).toContain('Dark');
		expect(fixture.nativeElement.textContent).toContain('Auto');
	});
});
