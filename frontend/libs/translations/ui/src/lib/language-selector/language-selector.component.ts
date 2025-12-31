import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { TranslationService } from '@foundation/translations/services';

@Component({
	selector: 'lib-language-selector',
	standalone: true,
	imports: [CommonModule],
	templateUrl: './language-selector.component.html',
	styleUrl: './language-selector.component.css',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LanguageSelectorComponent {
	translationService = inject(TranslationService);

	languages = [
		{ code: 'en', name: 'English', flag: '🇬🇧' },
		{ code: 'fr', name: 'Français', flag: '🇫🇷' },
		{ code: 'es', name: 'Español', flag: '🇪🇸' },
		{ code: 'it', name: 'Italiano', flag: '🇮🇹' },
		{ code: 'de', name: 'Deutsch', flag: '🇩🇪' },
	];

	setLanguage(langCode: string) {
		this.translationService.useLanguage(langCode);
	}
}
