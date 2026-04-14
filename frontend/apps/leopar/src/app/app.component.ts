import { AppConfigService } from '@foundation/app/config';
import { LayoutService } from '@foundation/app/layout';
import { UserLanguageSyncService } from '@foundation/users/state';
import { FloatingChatComponent } from '@foundation/conversations/ui'; // Added import
import { PlaylistBarComponent } from '@foundation/media/play/ui';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterModule } from '@angular/router';
import { tap } from 'rxjs';
import { environment } from '../environments/environment';
@Component({
	standalone: true,
	imports: [RouterModule, PlaylistBarComponent, FloatingChatComponent],
	selector: 'app-root',
	templateUrl: './app.component.html',
	styleUrls: ['./app.component.css'],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppComponent {
	title = environment.title;
	layoutService = inject(LayoutService);
	appConfigService = inject(AppConfigService);
	userLanguageSync = inject(UserLanguageSyncService);

	constructor() {
		this.appConfigService.config$
			.pipe(
				takeUntilDestroyed(),
				tap((config) => {
					console.log('[AppComponent] App config loaded:', config);
				})
			)
			.subscribe();

		this.appConfigService.config$_.environment = environment;
	}
}
