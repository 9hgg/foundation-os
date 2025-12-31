import { AppConfigService } from '@foundation/app/config';
import { Article } from '@foundation/articles/models';
import { ArticlesRepository } from '@foundation/articles/state';
import { ArticleTableComponent } from '@foundation/articles/ui';
import { ConversationsRepository } from '@foundation/conversations/state';
import { TranslationsRepository } from '@foundation/translations/state';
import { TranslationService } from '@foundation/translations/services';
import { TranslationTableComponent } from '@foundation/translations/ui';
import { TranslatePipe, TranslateDirective } from '@foundation/translations/services';
import { NotificationService } from '@foundation/notification';
import { slugify } from '@foundation/utils';
import { AsyncPipe } from '@angular/common';

import { ChangeDetectionStrategy, Component, effect, inject, model, viewChild } from '@angular/core';
import { Router } from '@angular/router';
import { of, switchMap, tap } from 'rxjs';
import { v4 as uuidv4 } from 'uuid';
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

	private _articlesRepository = inject(ArticlesRepository);
	private _conversationsRepository = inject(ConversationsRepository);
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

	private _i18n_createNewArticleSentence = this._translationService.prep('Give a name to your request:');
	public createNewArticle(kind: 'support' | 'backlog') {
		const articleId = uuidv4();

		this._notificationService
			.prompt(undefined, this._i18n_createNewArticleSentence(), { width: '300px' })
			.closed.pipe(
				switchMap((promptResult) => {
					if (!promptResult) return of(null);
					const articleName = promptResult.value;

					if (!articleName) return of(null);

					const article: Article = {
						id: articleId,
						kind,
						title: articleName,
						slug: slugify(articleName) + '_' + articleId,
						featured: false,
						draft: kind == 'backlog' ? true : false,
						tags: [],
						config: {
							commentsEnabled: true,
						},
					};
					return this._articlesRepository.store.postObject$(article);
				}),
				switchMap((r) => {
					if (r?.result?.data) {
						return this._conversationsRepository.createConversationFor$(articleId, 'article', 'default').pipe(
							tap((conversation) => {
								console.log('Conversation created or retrieved:', conversation);
								if (conversation) this._router.navigateByUrl('/host/dashboard/support/' + r.result.data.id);
							})
						);
					}
					return of(null);
				})
			)
			.subscribe();
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
