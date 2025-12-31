import { CommonModule, TitleCasePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output, inject } from '@angular/core';
import { AppConfigService } from '@foundation/app/config';
import { LayoutService } from '../layout.service';
import { ThemeConfig } from '@foundation/users/models';
import { TranslateDirective } from '@foundation/translations/services';

@Component({
	selector: 'lib-theme-selector',
	standalone: true,
	imports: [CommonModule, TitleCasePipe, TranslateDirective],
	templateUrl: './theme-selector.component.html',
	styleUrl: './theme-selector.component.css',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ThemeSelectorComponent {
	@Input() currentTheme: ThemeConfig = {};
	@Output() themeChange = new EventEmitter<Partial<ThemeConfig>>();

	layoutService = inject(LayoutService);
	private _appConfig = inject(AppConfigService);

	get themes(): string[] {
		return (this._appConfig.config$_.environment as any).availableThemes || [];
	}

	setMode(mode: 'light' | 'dark' | 'system') {
		this.layoutService.setMode(mode);
		this.themeChange.emit({ mode });
	}

	updateLightTheme(theme: string) {
		this.layoutService.updateLightTheme(theme);
		this.themeChange.emit({ mode: 'light', light: theme });
	}

	updateDarkTheme(theme: string) {
		this.layoutService.updateDarkTheme(theme);
		this.themeChange.emit({ mode: 'dark', dark: theme });
	}
}
