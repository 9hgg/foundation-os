import { CommonModule, TitleCasePipe } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, inject } from '@angular/core';
import { AppConfigService } from '@foundation/app/config';
import { UsersRepository } from '@foundation/users/state';
import { RequestService } from '@foundation/network/services';
import { LayoutService } from '../layout.service';
import { ThemeConfig } from '@foundation/users/models';

@Component({
	selector: 'lib-theme-selector-flat',
	standalone: true,
	imports: [CommonModule, TitleCasePipe],
	templateUrl: './theme-selector-flat.component.html',
	styleUrl: './theme-selector-flat.component.css',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ThemeSelectorFlatComponent {
	layoutService = inject(LayoutService);
	private _appConfig = inject(AppConfigService);
	private _usersRepository = inject(UsersRepository);
	private _requestService = inject(RequestService);

	get themes(): string[] {
		return this._appConfig.config$_.environment.availableThemes || [];
	}

	setMode(mode: 'light' | 'dark' | 'system', extraConfig: Partial<ThemeConfig> = {}) {
		console.log('ThemeSelectorFlatComponent.setMode', mode);
		this.layoutService.setMode(mode);
		this.syncThemeConfig({ mode, ...extraConfig });
	}

	updateLightTheme(theme: string) {
		console.log('updateLightTheme', theme);
		if (this.layoutService.effectiveMode() === 'light') {
			this.layoutService.setLightThemePref(theme);
			this.syncThemeConfig({ light: theme });
		} else {
			this.layoutService.updateLightTheme(theme);
			this.syncThemeConfig({ light: theme, mode: 'light' });
		}
	}

	updateDarkTheme(theme: string) {
		console.log('updateDarkTheme', theme);
		if (this.layoutService.effectiveMode() === 'dark') {
			this.layoutService.setDarkThemePref(theme);
			this.syncThemeConfig({ dark: theme });
		} else {
			this.layoutService.updateDarkTheme(theme);
			this.syncThemeConfig({ dark: theme, mode: 'dark' });
		}
	}

	private syncThemeConfig(changes: Partial<ThemeConfig>) {
		const user = this._usersRepository.currentProfile();
		if (!user) return;

		const currentTheme = user.config.theme || {};
		const newTheme = { ...currentTheme, ...changes };

		this._requestService
			.post$('/api/users/profile/update', {
				config: { theme: newTheme },
			})
			.subscribe({
				next: () => this._usersRepository.refreshUsers(),
				error: (e) => console.error('Failed to sync theme', e),
			});
	}
}
