import { ChangeDetectionStrategy, Component, HostListener, inject, input } from '@angular/core';
import { NotificationService } from '../notification.service';

@Component({
	selector: 'lib-notification-badge',
	standalone: true,
	imports: [],
	templateUrl: './notification-badge.component.html',
	changeDetection: ChangeDetectionStrategy.OnPush,
	styleUrls: ['./notification-badge.component.css'],
})
export class NotificationBadgeComponent {
	private _notificationService = inject(NotificationService);

	show = input<boolean>(false);
	message = input<string>('');
	title = input<string>('');

	backgroundColor = input<string>('#ef4444'); // red-500
	textColor = input<string>('#ffffff');
	size = input<'sm' | 'md' | 'lg'>('sm');

	@HostListener('click')
	onClick() {
		if (this.message()) {
			this._notificationService.notify(this.message(), this.title());
		}
	}
}
