import { Component } from '@angular/core';
import { RouterModule } from '@angular/router';
import { LeoparFooterComponent, LeoparHeaderComponent } from '@leopar/ui';

@Component({
	selector: 'lib-leopar-landing-page-router-page',
	standalone: true,
	imports: [RouterModule, LeoparHeaderComponent, LeoparFooterComponent],
	templateUrl: './leopar-landing-page-router-page.component.html',
	styleUrl: './leopar-landing-page-router-page.component.css',
})
export class LeoparLandingPageRouterPageComponent {}
