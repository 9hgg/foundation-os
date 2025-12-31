import { CommonModule, TitleCasePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { AppConfigService } from '@foundation/app/config';
import { LayoutService } from '../layout.service';

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

	get themes(): string[] {
		return (this._appConfig.config$_.environment as any).availableThemes || [];
	}

	setMode(mode: 'light' | 'dark' | 'system') {
		this.layoutService.setMode(mode);
	}

	updateLightTheme(theme: string) {
		this.layoutService.updateLightTheme(theme);
		if (this.layoutService.effectiveMode() !== 'light') {
			this.layoutService.setMode('light');
		}
	}

	updateDarkTheme(theme: string) {
		this.layoutService.updateDarkTheme(theme);
		if (this.layoutService.effectiveMode() !== 'dark') {
			this.layoutService.setMode('dark');
		}
	}
}
