import { User } from '@foundation/users/models';
import { UsersRepository } from '@foundation/users/state';
import { Component, computed, effect, inject, input, model, OnDestroy } from '@angular/core';
import { filter, take, tap, takeUntil } from 'rxjs';
import { Subject } from 'rxjs';

@Component({
	selector: 'lib-user-pill',
	templateUrl: './user-pill.component.html',
	styleUrl: './user-pill.component.css',
	standalone: true,
})
export class UserPillComponent implements OnDestroy {
	private _usersRepository = inject(UsersRepository);
	private destroyed$ = new Subject<void>();

	maxLength = input<number | null>(30);

	user = input<User | null>(null);
	userId = input<string | null>(null);

	userPublicName = model<string>('someone');

	userPublicNameTruncated = computed(() => {
		const userPublicName = this.userPublicName();
		const maxLength = this.maxLength();
		if (maxLength && userPublicName.length > maxLength) {
			return userPublicName.substring(0, maxLength) + '...';
		}
		return userPublicName;
	});

	constructor() {
		effect(() => {
			const userId = this.userId();
			const user = this.user();
			const userId_ = userId ?? user?.id ?? null;

			if (!userId_) return;
			this._usersRepository
				.getUserPublicDetails$(userId_)
				.pipe(
					filter((a) => !!a),
					take(1),
					takeUntil(this.destroyed$),
					tap((a) => {
						if (!this) {
							console.warn('UserPillComponent: this is undefined, cannot set userPublicName');
							return;
						}
						if (a.publicName) this.userPublicName.set(a.publicName);
						else if (a.starredEmail) this.userPublicName.set(a.starredEmail);
					})
				)
				.subscribe();
		});
	}

	ngOnDestroy(): void {
		this.destroyed$.next();
		this.destroyed$.complete();
	}
}
