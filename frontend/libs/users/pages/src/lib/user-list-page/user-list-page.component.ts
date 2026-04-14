import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { NotificationService } from '@foundation/notification';
import { TranslateDirective } from '@foundation/translations/services';
import { UsersRepository } from '@foundation/users/state';
import { UserTableComponent } from '@foundation/users/ui';

@Component({
	selector: 'lib-user-list-page',
	standalone: true,
	imports: [TranslateDirective, UserTableComponent],
	templateUrl: './user-list-page.component.html',
	styleUrl: './user-list-page.component.css',
	changeDetection: ChangeDetectionStrategy.OnPush,
	host: {
		class: 'dashboard-page-host',
	},
})
export class UserListPageComponent {
	usersRepository = inject(UsersRepository);
	private _router = inject(Router);
	private _notificationService = inject(NotificationService);

	createNewUser() {
		this._notificationService.snackError('This feature is not implemented yet. Please use the API or the admin dashboard to create new users.', 'Not implemented');
	}

	goToUser(userId: string) {
		this._notificationService.snackError('This feature is not implemented yet. Please use the API or the admin dashboard to manage users.', 'Not implemented');
	}
}
