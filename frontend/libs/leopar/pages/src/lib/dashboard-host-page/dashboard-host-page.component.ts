import { CdkMenuModule } from '@angular/cdk/menu';
import { Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { Router, RouterModule } from '@angular/router';
import { LayoutService } from '@foundation/app/layout';
import { AuthTokensRepository } from '@foundation/auth/state';
import { convertToUrl } from '@foundation/files/state';
import { TwAddIcon, TwDashboardIcon, TwFileIcon, TwFolderIcon, TwLockOpenIcon, TwLogoutIcon, TwProjectIcon, TwSupportIcon, TwTeamIcon, TwUserIcon } from '@foundation/icons';
import { AccessService } from '@foundation/shared/access';
import { TranslateDirective } from '@foundation/translations/services';
import { UsersRepository } from '@foundation/users/state';

@Component({
	selector: 'app-dashboard-host-page',
	standalone: true,
	imports: [RouterModule, TranslateDirective, CdkMenuModule, TwAddIcon, TwProjectIcon, TwFileIcon, TwDashboardIcon, TwFolderIcon, TwTeamIcon, TwSupportIcon, TwUserIcon, TwLogoutIcon, TwLockOpenIcon],
	templateUrl: './dashboard-host-page.component.html',
	styleUrl: './dashboard-host-page.component.css',
})
export class LeoparDashboardHostPageComponent {
	private _authTokensRepository = inject(AuthTokensRepository);
	public layoutService = inject(LayoutService);
	private _router = inject(Router);
	private _usersRepository = inject(UsersRepository);
	private _accessService = inject(AccessService);
	isAdmin = toSignal(this._accessService.checkAdmin$(), { initialValue: false });

	currentUserDisplay = computed(() => {
		const currentProfile = this._usersRepository.currentProfile();
		return currentProfile?.pseudo ?? currentProfile?.email ?? 'Unknown User';
	});

	currentUserAvatar = computed(() => {
		const currentProfile = this._usersRepository.currentProfile();
		const profilePictureId = currentProfile?.config.profilePictureId;
		if (profilePictureId) {
			return convertToUrl(profilePictureId, 'thumbnail');
		}
		return undefined;
	});

	showPseudoNotification = computed(() => {
		const currentProfile = this._usersRepository.currentProfile();
		return !currentProfile?.pseudo || currentProfile.pseudo.trim() === '';
	});

	public logout() {
		this._authTokensRepository.logout();
		window.location.href = '/';
	}

	navigateToProfile() {
		this._router.navigate(['/host/dashboard/profile']);
	}
}
