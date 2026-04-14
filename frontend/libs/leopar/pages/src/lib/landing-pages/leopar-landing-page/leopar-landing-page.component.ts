import { Component, inject } from '@angular/core';
import { RouterModule } from '@angular/router';
import { TranslationService } from '@foundation/translations/services';

// DEBUG
// project_name=leopar
// project_name_upper_first_letter=Leopar

@Component({
	selector: 'app-leopar-landing-page',
	standalone: true,
	imports: [RouterModule],
	templateUrl: './leopar-landing-page.component.html',
	styleUrl: './leopar-landing-page.component.css',
})
export class LeoparLandingPageComponent {
	translateService = inject(TranslationService);
	currentLangCode$$$ = this.translateService.currentLangCode$$$;
}
