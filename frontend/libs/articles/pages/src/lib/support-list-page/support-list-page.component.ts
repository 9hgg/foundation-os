import { AsyncPipe } from '@angular/common';
import { AppConfigService } from '@foundation/app/config';
import { Article } from '@foundation/articles/models';
import { SupportService } from '@foundation/articles/state';
import { ArticleTableComponent } from '@foundation/articles/ui';
import { NotificationService } from '@foundation/notification';
import { TranslateDirective, TranslationService } from '@foundation/translations/services';

import { ChangeDetectionStrategy, Component, effect, inject, model, viewChild } from '@angular/core';
import { Router } from '@angular/router';
const DEBUG = true;

@Component({
	selector: 'lib-support-list-page',
	standalone: true,
	imports: [AsyncPipe, TranslateDirective, ArticleTableComponent],
	templateUrl: './support-list-page.component.html',
	styleUrl: './support-list-page.component.css',
	changeDetection: ChangeDetectionStrategy.OnPush,
	host: { class: 'dashboard-page-host' },
})
export class SupportListPageComponent {
	private _translationService = inject(TranslationService);
	private _notificationService = inject(NotificationService);
	private _router = inject(Router);

	private _supportService = inject(SupportService);
	public appConfigService = inject(AppConfigService);

	articles = model<(Article | null)[]>([]);

	// Tabs: 'backlog' (feature requests, public) | 'support' (tickets, private)
	selectedTab = model<'backlog' | 'support'>('backlog');

	private _articleTable = viewChild<ArticleTableComponent>('articleTable');

	constructor() {
		effect(() => {
			const articleTable = this._articleTable();
			if (articleTable) {
				console.log('ArticleTableComponent found, setting up filters');

				// articleTable.paginator._alwaysOnFilters$$$.next([
				// 	{
				// 		fieldName: 'kind',
				// 		value: 'support',
				// 		matchType: 'exact',
				// 	},
				// ]);
				// articleTable.paginator.refresh();
				console.log('ArticleTableComponent filters set to support articles only', articleTable.paginator);
			} else {
				if (DEBUG) console.warn('ArticleTableComponent not found yet');
			}
		});
	}

	public createNewArticle(kind: 'support' | 'backlog') {
		this._supportService
			.createTicket$(kind)
			.subscribe((article) => {
				if (article) this._router.navigateByUrl('/host/dashboard/support/' + article.id);
			});
	}

	public goToArticle(articleId: string) {
		this._router.navigateByUrl('/host/dashboard/support/' + articleId);
	}

	public goToKnowledgeBase() {
		this._router.navigateByUrl('/support/articles');
	}

	public goToFaq() {
		this._router.navigateByUrl('/faq');
	}

	public copyEmail() {
		const email = this.appConfigService.config$_.environment?.support?.email;
		if (!email) {
			this._notificationService.notify('Email not available', 'error');
			return;
		}
		navigator.clipboard.writeText(email).then(() => {
			this._notificationService.notify('Email copied to clipboard!', 'success');
		});
	}
}
