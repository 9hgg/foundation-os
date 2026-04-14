import { Component } from '@angular/core';
import { TranslateDirective } from '@foundation/translations/services';

@Component({
	selector: 'lib-dashboard-home-page',
	standalone: true,
	imports: [TranslateDirective],
	templateUrl: './dashboard-home-page.component.html',
	styleUrl: './dashboard-home-page.component.css',
	host: {
		class: 'dashboard-page-host',
	},
})
export class DashboardHomePageComponent {}
