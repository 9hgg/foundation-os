import { AsyncPipe } from '@angular/common';
import { Component, inject } from '@angular/core';
import { RouterModule } from '@angular/router';
import { AppConfigService } from '@foundation/app/config';
import { TranslateDirective } from '@foundation/translations/services';

@Component({
	selector: 'lib-support-page',
	standalone: true,
	imports: [TranslateDirective, RouterModule, AsyncPipe],
	templateUrl: './support-page.component.html',
	styleUrl: './support-page.component.css',
})
export class SupportPageComponent {
	public appConfigService = inject(AppConfigService);
	public window = window;
}
