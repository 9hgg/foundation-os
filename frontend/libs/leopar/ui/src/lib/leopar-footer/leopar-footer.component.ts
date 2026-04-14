import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { AppConfigService } from '@foundation/app/config';
import { LayoutService } from '@foundation/app/layout';
import { RequestService } from '@foundation/network/services';
import { LanguageSelectorComponent } from '@foundation/translations/ui';
import { ThemeConfig } from '@foundation/users/models';
import { UsersRepository } from '@foundation/users/state';

@Component({
	selector: 'lib-leopar-footer',
	standalone: true,
	imports: [CommonModule, RouterModule, FormsModule, LanguageSelectorComponent],
	templateUrl: './leopar-footer.component.html',
	styleUrl: './leopar-footer.component.css',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LeoparFooterComponent {
	currentYear = new Date().getFullYear();
	layoutService = inject(LayoutService);
	usersRepository = inject(UsersRepository);
	requestService = inject(RequestService);
	private _appConfig = inject(AppConfigService);

	public get themes(): string[] {
		return this._appConfig.config$_.environment.availableThemes || [];
	}

	setMode(mode: 'light' | 'dark' | 'system') {
		this.layoutService.setMode(mode);
		this.syncThemeConfig({ mode });
	}

	updateLightTheme(theme: string) {
		this.layoutService.updateLightTheme(theme);
		this.syncThemeConfig({ light: theme, mode: 'light' });
	}

	updateDarkTheme(theme: string) {
		this.layoutService.updateDarkTheme(theme);
		this.syncThemeConfig({ dark: theme, mode: 'dark' });
	}

	private syncThemeConfig(changes: Partial<ThemeConfig>) {
		const user = this.usersRepository.currentProfile();
		if (!user) return;

		const currentTheme = user.config.theme || {};
		const newTheme = { ...currentTheme, ...changes };

		this.requestService
			.post$('/api/users/profile/update', {
				config: { theme: newTheme },
			})
			.subscribe({
				next: () => this.usersRepository.refreshUsers(),
				error: (e) => console.error('Failed to sync theme', e),
			});
	}
}
