import { AuthTokensRepository, DEFAULT_AUTHTOKEN_PROPS } from '@foundation/auth/state';
import { convertToUrl } from '@foundation/files/state';
import { TranslateDirective } from '@foundation/translations/services';
import { User } from '@foundation/users/models';
import { UsersRepository } from '@foundation/users/state';

import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterModule } from '@angular/router';
import { tap } from 'rxjs';

@Component({
	selector: 'lib-leopar-header',
	standalone: true,
	imports: [RouterModule, TranslateDirective],
	templateUrl: './leopar-header.component.html',
	styleUrl: './leopar-header.component.css',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LeoparHeaderComponent {
	public isMenuOpen = false;

	private _authTokensRepository = inject(AuthTokensRepository);
	private _usersRepository = inject(UsersRepository);

	public connectedUsers = signal<{ user: User; authToken: string }[]>([]);
	public authTokenProps = signal(DEFAULT_AUTHTOKEN_PROPS);

	public currentUserAvatar = computed(() => {
		const currentProfile = this._usersRepository.currentProfile();
		const profilePictureId = currentProfile?.config.profilePictureId;
		if (profilePictureId) {
			return convertToUrl(profilePictureId, 'thumbnail');
		}
		return undefined;
	});

	constructor() {
		// get current used token
		this._authTokensRepository.authTokenProps$$$
			.pipe(
				takeUntilDestroyed(),
				tap((authTokenProps) => {
					this.authTokenProps.set(authTokenProps);
				})
			)
			.subscribe();

		// get connected users details
		this._usersRepository.connectedUsers$$$
			.pipe(
				takeUntilDestroyed(),
				tap((connectedUsers) => {
					this.connectedUsers.set(connectedUsers);
				})
			)
			.subscribe();
	}

	public updateSelectedAccount(event: Event) {
		const selectElement = event.target as HTMLSelectElement;
		console.log('Selected value:', selectElement.value);
		this._authTokensRepository.selectCurrentToken(selectElement.value);
	}

	public logout() {
		this._authTokensRepository.logout();
	}
}
