import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, effect, inject, input } from '@angular/core';
import { BehaviorSubjectReplayedProxied } from '@foundation/utils';
import { User } from '@foundation/users/models';
import { UsersRepository } from '@foundation/users/state';
import { map, of } from 'rxjs';

@Component({
	selector: 'lib-user-json-page',
	standalone: true,
	imports: [
		//
		CommonModule,
	],
	templateUrl: './user-json-page.component.html',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UserJsonPageComponent {
	private _usersRepository = inject(UsersRepository);

	public userId = input<string | null>(null);

	user$$$ = new BehaviorSubjectReplayedProxied<string | null, User | null>((id) => this._usersRepository.getUserByIdAsAdmin$(id), null);

	constructor() {
		effect(() => {
			const userId = this.userId();
			this.user$$$.next(userId);
		});
	}
}
