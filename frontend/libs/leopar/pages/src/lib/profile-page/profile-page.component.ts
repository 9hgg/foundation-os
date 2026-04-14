import { CommonModule } from '@angular/common';
import { Component, inject, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { ThemeSelectorComponent } from '@foundation/app/layout';
import { UploadButtonComponent } from '@foundation/files/ui';
import { TranslateDirective } from '@foundation/translations/services';
import { LanguageSelectorComponent } from '@foundation/translations/ui';
import { GenericProfilePageComponent } from '@foundation/users/pages';

@Component({
	selector: 'app-profile-page',
	standalone: true,
	imports: [TranslateDirective, UploadButtonComponent, LanguageSelectorComponent, CommonModule, ThemeSelectorComponent],
	templateUrl: './profile-page.component.html',
	styleUrl: './profile-page.component.css',
})
export class ProfilePageComponent extends GenericProfilePageComponent implements OnInit {
	private _route = inject(ActivatedRoute);

	ngOnInit() {
		// Handle URL fragment for auto-scrolling
		this._route.fragment.subscribe((fragment) => {
			if (fragment) {
				// Use setTimeout to ensure the DOM is rendered
				setTimeout(() => {
					const element = document.getElementById(fragment);
					if (element) {
						element.scrollIntoView({ behavior: 'smooth', block: 'start' });
					}
				}, 100);
			}
		});
	}
}
