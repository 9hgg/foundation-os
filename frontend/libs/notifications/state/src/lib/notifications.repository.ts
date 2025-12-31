import { GenericRepository } from '@foundation/table/state';
import { Notification } from '@foundation/notifications/models';
import { Injectable } from '@angular/core';
import { tap } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class NotificationsRepository extends GenericRepository<Notification> {
	constructor() {
		super('notification');
	}

	public toggleRead$(notificationId: string) {
		return this._requestService.post$<{ notification: Notification }>(`/api/notifications/${notificationId}/read/toggle`, {}).pipe(
			tap((response) => {
				console.log('Toggle read response:', response);
			})
		);
	}
}
