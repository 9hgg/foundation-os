import { ChangeDetectionStrategy, Component, HostListener, inject, input } from '@angular/core';
import { NotificationService } from '../notification.service';

@Component({
	selector: 'lib-question-mark-helper',
	standalone: true,
	imports: [],
	templateUrl: './question-mark-helper.component.html',
	changeDetection: ChangeDetectionStrategy.OnPush,
	styleUrls: ['./question-mark-helper.component.css'],
})
export class QuestionMarkHelpComponent {
	private _notificationService = inject(NotificationService);

	message = input.required<string>();
	title = input<string>();

	backgroundColor = input<string>('#00000020');

	@HostListener('click')
	onClick() {
		this._notificationService.notify(this.message(), this.title());
	}
}
