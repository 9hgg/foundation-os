import { Article } from '@foundation/articles/models';
import { ArticlesRepository } from '@foundation/articles/state';
import { ArticleTableComponent } from '@foundation/articles/ui';
import { NotificationService } from '@foundation/notification';
import { TranslationService } from '@foundation/translations/services';
import { TranslateDirective } from '@foundation/translations/services';
import { slugify } from '@foundation/utils';
import { ChangeDetectionStrategy, Component, inject, model } from '@angular/core';
import { Router } from '@angular/router';
import { map, of, switchMap, tap } from 'rxjs';
import { v4 as uuidv4 } from 'uuid';

@Component({
	selector: 'lib-article-list-page',
	standalone: true,
	imports: [TranslateDirective, ArticleTableComponent],
	templateUrl: './article-list-page.component.html',
	styleUrl: './article-list-page.component.css',
	changeDetection: ChangeDetectionStrategy.OnPush,
	host: { class: 'dashboard-page-host' },
})
export class ArticleListPageComponent {
	private _translationService = inject(TranslationService);
	private _notificationService = inject(NotificationService);
	private _router = inject(Router);

	private _articlesRepository = inject(ArticlesRepository);

	articles = model<(Article | null)[]>([]);

	private _i18n_createNewArticleSentence = this._translationService.prep('Give a name to your new article:');
	public createNewArticle() {
		this._notificationService
			.prompt(undefined, this._i18n_createNewArticleSentence(), { width: '300px' })
			.closed.pipe(
				switchMap((promptResult) => {
					if (!promptResult) return of(null);
					const articleName = promptResult.value;

					if (!articleName) return of(null);

					const articleId = uuidv4();

					const article: Article = {
						id: articleId,
						kind: 'default',
						title: articleName,
						slug: slugify(articleName),
						featured: false,
						draft: true,
						tags: [],
						config: {},
					};
					return of(article);
				}),
				switchMap((article: Article | null) => {
					if (!article) return of(null);
					// check slug unicity from backend
					return this._articlesRepository.isSlugAvailable$(article.slug ?? '').pipe(
						map((r) => {
							if (r?.result?.slugAvailable) {
								return article;
							}
							// add timestamp to the slug
							article.slug = slugify(article.title + '-' + Date.now());
							return article;
						})
					);
				}),
				switchMap((article: Article | null) => {
					if (!article) return of(null);
					return this._articlesRepository.store.postObject$(article);
				}),
				tap((r) => {
					if (r?.result?.data.id) {
						this._router.navigateByUrl('/host/dashboard/articles/' + r.result.data.id + '/builder');
					}
				})
			)
			.subscribe();
	}

	public goToArticle(articleId: string) {
		this._articlesRepository.goToArticle(articleId, {
			toEditor: true,
		});
	}
}
