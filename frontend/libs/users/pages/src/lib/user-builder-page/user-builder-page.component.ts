import { CdkMenuModule } from '@angular/cdk/menu';
import { PortalModule } from '@angular/cdk/portal';
import { CommonModule, DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { AppConfigService } from '@foundation/app/config';
import { NotificationService } from '@foundation/notification';
import { User } from '@foundation/users/models';
import { UsersRepository } from '@foundation/users/state';
import { PatchableItem } from '@foundation/utils';

@Component({
	selector: 'lib-user-builder-page',
	standalone: true,
	imports: [CommonModule, DatePipe, FormsModule, RouterModule, CdkMenuModule, PortalModule],
	templateUrl: './user-builder-page.component.html',
	styleUrls: ['./user-builder-page.component.css'],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UserBuilderPageComponent {
	public notificationService = inject(NotificationService);
	private _usersRepository = inject(UsersRepository);
	private _appConfig = inject(AppConfigService);
	public digestFrequencies: Array<'never' | 'hourly' | 'daily' | 'weekly' | 'monthly'> = ['never', 'hourly', 'daily', 'weekly', 'monthly'];
	public themeModes: Array<'light' | 'dark' | 'system'> = ['system', 'light', 'dark'];
	public languages = [
		{ code: 'en', name: 'English' },
		{ code: 'fr', name: 'Francais' },
		{ code: 'es', name: 'Espanol' },
		{ code: 'it', name: 'Italiano' },
		{ code: 'de', name: 'Deutsch' },
	];

	public userId = input<string | null>(null);
	patchableUser = new PatchableItem<User>(
		this.userId,
		(id) => this._usersRepository.getUserByIdAsAdmin$(id),
		(id, patch) => this._saveUser(id, patch)
	);

	public availableThemes = computed(() => this._appConfig.config$_.environment.availableThemes || ['light', 'dark']);

	confirmAndVerifyEmail(user: User) {
		if (user.emailVerified) return;

		this.notificationService
			.confirm(`Mark this email as verified?\n${user.email ?? ''}`, 'Verify email', {
				confirmButtonText: 'Verify email',
			})
			.closed.subscribe((confirmed) => {
				if (!confirmed) return;

				this._usersRepository.verifyUserEmail$(user.id).subscribe((response) => {
					if (response.error) {
						this.notificationService.snackWarning(response.error.description ?? 'Unable to verify email.', response.error.title);
						return;
					}

					this.notificationService.snackSuccess(response.result?.message ?? 'Email verified successfully.');
					this.patchableUser.item$$$.next(user.id);
				});
			});
	}

	private _saveUser(userId: string, payload: Partial<User>) {
		this._usersRepository.updateUserAsAdmin$(userId, payload).subscribe((response) => {
			if (response.error) {
				this.notificationService.snackWarning(response.error.description ?? response.error.title, response.error.title);
				return;
			}
			this.patchableUser.item$$$.next(userId);
		});
	}
}
