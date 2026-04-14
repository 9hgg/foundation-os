/* eslint-disable @angular-eslint/prefer-inject */
import { CdkMenu, CdkMenuItem, CdkMenuModule } from '@angular/cdk/menu';
import { CommonModule } from '@angular/common';
import { Attribute, ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { ArticlesRepository } from '@foundation/articles/state';
import { ArticlePillComponent } from '@foundation/articles/ui';
import { TwArchiveIcon } from '@foundation/icons';
import { Filter } from '@foundation/network/store';
import { Notification } from '@foundation/notifications/models';
import { NotificationsRepository } from '@foundation/notifications/state';
import { BehaviorType, RepositoryTableComponent } from '@foundation/table/ui';
import { TranslateDirective, TranslatePipe } from '@foundation/translations/services';
import { UserPillComponent } from '@foundation/users/ui';
import { DateAsAgoPipe } from '@foundation/utils';
import { tap } from 'rxjs';

const EXCLUDE_ARCHIVED_FILTER: Filter = {
	fieldName: 'archived',
	value: '~true',
	matchType: 'exact',
	comparison: '<>',
};

@Component({
	selector: 'lib-notification-table',
	standalone: true,
	imports: [
		//
		CommonModule,
		TranslateDirective,
		TranslatePipe,
		ReactiveFormsModule,
		FormsModule,
		CdkMenuModule,
		CdkMenu,
		CdkMenuItem,
		ArticlePillComponent,
		UserPillComponent,
		DateAsAgoPipe,
		TwArchiveIcon,
	],
	templateUrl: './notification-table.component.html',
	styleUrl: './notification-table.component.css',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NotificationTableComponent extends RepositoryTableComponent<Notification, NotificationsRepository> {
	private _articlesRepository = inject(ArticlesRepository);

	constructor(
		private _repository: NotificationsRepository,
		@Attribute('click-behavior') clickBehavior: BehaviorType
	) {
		super(
			_repository,
			{
				pageSize: 5,
				orderingBy: {
					direction: 'desc',
					fieldName: 'time_created',
				},
				alwaysOnFilters: [EXCLUDE_ARCHIVED_FILTER],
			},
			clickBehavior
		);
	}

	public toggleRead(notification: Notification) {
		return this._requestService
			.post$<{ notification: Notification }>(`/api/notifications/${notification.id}/read/toggle`, {})
			.pipe(
				tap((response) => {
					console.log('Toggle read response:', response);
					this.paginator.refresh();
				})
			)
			.subscribe();
	}
	public toggleArchived(notification: Notification) {
		return this._requestService
			.post$<{ notification: Notification }>(`/api/notifications/${notification.id}/archived/toggle`, {})
			.pipe(
				tap((response) => {
					console.log('Toggle archived response:', response);
					this.paginator.refresh();
				})
			)
			.subscribe();
	}

	toggleDisplayAllArchived() {
		console.log('Toggle display all archived');

		const currentFilters = this.paginator._alwaysOnFilters$$$.value;
		console.log('Current filters:', currentFilters);

		if (currentFilters && currentFilters.some((f) => f.fieldName === 'archived')) {
			console.log('Removing archived filter');

			this.paginator.setAlwaysOnFilters([]);
		} else {
			console.log('Adding archived filter');
			this.paginator.setAlwaysOnFilters([EXCLUDE_ARCHIVED_FILTER]);
		}
	}

	markAllAsRead() {
		console.log('Marking all notifications as read');
		this._requestService
			.post$<{ notifications: Notification[] }>('/api/notifications/read/all', {})
			.pipe(
				tap((response) => {
					console.log('Mark all as read response:', response);
					this.paginator.refresh();
				})
			)
			.subscribe();
	}

	override customFunction(notification: Notification): void {
		if (!notification.read) {
			this.toggleRead(notification);
		}

		switch (notification.kind) {
			case 'comment':
			case 'reaction':
			case 'mention':
			case 'reply': {
				const articleId = notification.targetId;
				const messageId = notification.config?.messageId;
				this._articlesRepository.goToArticle(articleId, { messageId });
				break;
			}

			default:
				console.log('Not implemented for notification:', notification);
				break;
		}
	}
}
