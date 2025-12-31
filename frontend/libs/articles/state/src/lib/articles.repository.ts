import { Article } from '@foundation/articles/models';
import { GenericRepository } from '@foundation/table/state';
import { slugify } from '@foundation/utils';
import { Injectable } from '@angular/core';
import { map, of, switchMap, tap } from 'rxjs';
import { v4 as uuidv4 } from 'uuid';

@Injectable({ providedIn: 'root' })
export class ArticlesRepository extends GenericRepository<Article> {
	constructor() {
		super('article');
	}

	public goToArticle(articleId: string, options_?: Partial<{ messageId?: string; toEditor: boolean; inNewTab: boolean }>): void {
		const { messageId, toEditor, inNewTab } = {
			messageId: options_?.messageId,
			toEditor: options_?.toEditor ?? false,
			inNewTab: options_?.inNewTab ?? false,
		};
		this.store.getObjectById$$$(articleId, true).subscribe((article) => {
			if (!article) {
				console.error('Article not found:', articleId);
				return;
			}

			if (article.kind === 'support') {
				console.warn('Article is a support article, redirecting to support page:', articleId);
				this._router.navigate(['/', 'host', 'dashboard', 'support', articleId], {
					fragment: messageId ? 'message-' + messageId : undefined,
				});
				return;
			}

			if (inNewTab) {
				// warn if toEditor is true
				if (toEditor) {
					console.warn('Opening article in a new tab with editor mode is not supported. Redirecting to article view.');
				}
				// open in a new tab
				window.open('/host/dashboard/articles/' + articleId + (messageId ? '#message-' + messageId : ''), '_blank');
			} else if (toEditor) {
				this._router.navigate(['/', 'host', 'dashboard', 'articles', articleId, 'builder']);
			} else {
				this._router.navigate(['/', 'host', 'dashboard', 'articles', articleId], {
					fragment: messageId ? 'message-' + messageId : undefined,
				});
			}
			if (messageId) {
				setTimeout(() => {
					// scroll to message if messageId is provided
					const element = document.getElementById('message-' + messageId);
					if (element) {
						element.scrollIntoView({ behavior: 'smooth' });
					}
				}, 100);
			}
		});
	}

	public goToArticleEditor(articleId: string): void {
		this._router.navigate(['/', 'host', 'dashboard', 'articles', articleId, 'builder']);
	}

	public goToArticleSupport(articleId: string): void {
		this._router.navigate(['/', 'host', 'dashboard', 'support', articleId]);
	}

	public goToArticleList(): void {
		this._router.navigate(['/', 'host', 'dashboard', 'articles']);
	}

	public goToArticlePublicPage(articleId: string): void {}

	public isSlugAvailable$(slug: string) {
		return this._requestService.getBasic$<{ slugAvailable: boolean }>('/api/articles/check-slug/' + slug);
	}

	private _i18n_createNewArticleSentence = this._translationService.prep('Give a name to your new article:');
	public createNewArticle$(folderId?: string | null) {
		return this._notificationService.prompt(undefined, this._i18n_createNewArticleSentence(), { width: '300px' }).closed.pipe(
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
				return this.isSlugAvailable$(article.slug ?? '').pipe(
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
				return this.store.postObject$(article);
			}),
			switchMap((r) => {
				if (r?.result?.data.id && folderId) {
					return this._requestService.getBasic$(`/api/folders/${folderId}/add/article/${r.result.data.id}`).pipe(map(() => r));
				}
				return of(r);
			})
		);
	}
}
