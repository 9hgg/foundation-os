import { Notification } from '@foundation/notifications/models';
import { NotificationsRepository } from '@foundation/notifications/state';
import { ImageBlot } from '@foundation/quill/blots';
import { BehaviorSubjectReplayedProxied } from '@foundation/utils';
import { CdkMenuModule } from '@angular/cdk/menu';
import { PortalModule } from '@angular/cdk/portal';
import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, model } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import Quill from 'quill';
import { of } from 'rxjs';

Quill.register(ImageBlot, true);

@Component({
	selector: 'lib-notification-displayer',
	standalone: true,
	imports: [
		//
		CommonModule,
		FormsModule,
		RouterModule,
		CdkMenuModule,
		PortalModule,
	],
	templateUrl: './notification-displayer.component.html',
	styleUrls: ['./notification-displayer.component.css'],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NotificationDisplayerComponent {
	private _notificationsRepository = inject(NotificationsRepository);

	public notificationId = model<string | null>(null);
	notification$$$ = new BehaviorSubjectReplayedProxied<string | null, Notification | null>((id: string | null) => {
		return id ? this._notificationsRepository.store.getObjectById$$$(id).$ : of(null);
	}, null);
}
