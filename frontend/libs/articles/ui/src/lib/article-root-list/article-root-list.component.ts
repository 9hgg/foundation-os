import { Article } from '@foundation/articles/models';
import { ArticlesRepository } from '@foundation/articles/state';
import { convertToUrl } from '@foundation/files/state';
import { createLocalRequestFn, Filter, PaginatorState } from '@foundation/network/store';
import { RequestService } from '@foundation/network/services';
import { createBehaviorSubjectProxy } from '@foundation/utils';
import { CommonModule } from '@angular/common';
import { Component, effect, inject, input, model } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { combineLatest, debounceTime, of, switchMap, tap } from 'rxjs';
import { ArticleDisplayerComponent } from '../article-displayer/article-displayer.component';

const NUMBER_OF_ALL_ARTICLES = 10;
const NUMBER_OF_FEATURED_ARTICLES = 3;

export function filterPublishedFolderArticles<TArticle extends Pick<Article, 'draft'>>(articles: TArticle[]): TArticle[] {
	return articles.filter((article) => !article.draft);
}

@Component({
	selector: 'lib-article-root-list',
	standalone: true,
	imports: [CommonModule, FormsModule, RouterModule, ArticleDisplayerComponent],
	templateUrl: './article-root-list.component.html',
	styleUrl: './article-root-list.component.css',
})
export class ArticleRootListComponent {
	commentTitle = input<string | undefined>();

	/** The title of the list (may be set in the route config) */
	listName = input('Blog');
	/** The description of the list (may be set in the route config) */
	listDescription = input('Insights, tutorials, and stories on podcasting, audio production, digital media and the company history.');

	// if set we should get the explicit articles from the folder
	sourceFolderId = input.required<string | null>();

	// if set we should get the explicit articles from the folder
	article = model<Article | null>(null);

	private _articlesRepository = inject(ArticlesRepository);
	private _router = inject(Router);
	private _requestService = inject(RequestService);

	activatedRoute = inject(ActivatedRoute);
	rootPath = '';

	// articles
	/** explicit are used when the list is already known */

	// for all articles
	explicitAllArticles = model<(Article | null)[] | null>(null);
	allArticlesPaginator: PaginatorState<Article> = new PaginatorState<Article>({
		pageSize: NUMBER_OF_ALL_ARTICLES,
		orderingBy: {
			direction: 'desc',
			fieldName: 'time_published',
		},
	});

	// for featured articles
	explicitFeaturedArticles = model<(Article | null)[] | null>(null);
	featuredArticlesPaginator: PaginatorState<Article> = new PaginatorState<Article>({
		pageSize: NUMBER_OF_FEATURED_ARTICLES,
		orderingBy: {
			direction: 'desc',
			fieldName: 'time_published',
		},
	});

	articleSearchPattern = model<string | null>(null);
	articleFiltersForm = new FormGroup({
		title: new FormControl<string>(''),
	});
	filterByFields$_ = createBehaviorSubjectProxy({} as Record<string, string>);

	constructor() {
		console.log('[articleRootList](constructor)');

		// react to the route params to select the article and update the rootPath
		combineLatest([this.activatedRoute.url, toObservable(this.explicitAllArticles)])
			.pipe(
				takeUntilDestroyed(),
				tap(([segments, articles]) => {
					if (!articles || articles.length === 0) {
						// no articles
						return;
					}

					console.log('segments', segments);
					if (segments.length < 2) {
						// no article selected
						// use first featured article
						const firstFeaturedArticle = articles.find((article) => article?.featured);
						if (firstFeaturedArticle) {
							this.article.set(firstFeaturedArticle);
							return;
						}
						const firstArticle = articles[0];
						this.article.set(firstArticle);
						return;
					}

					let articleIdentifier = segments[1].path;
					if (segments.length == 3) {
						articleIdentifier = segments[2].path;
					}

					console.log('segments', segments);
					console.log('articleIdentifier', articleIdentifier);

					// either it's uuid or slug
					if (articleIdentifier) {
						const article = articles.find((article) => article?.id === articleIdentifier || article?.slug === articleIdentifier);
						if (article) {
							console.log('article', article);
							this.article.set(article);
							return;
						} else {
							console.log('article not found');
						}
					}
				})
			)
			.subscribe();

		// react to filters of the article table
		this.articleFiltersForm.valueChanges
			.pipe(
				takeUntilDestroyed(),
				debounceTime(300),
				tap((controls) => {
					const newFilters: Filter[] = Object.entries(controls).map((keyvalue) => {
						return {
							fieldName: keyvalue[0],
							value: keyvalue[1],
							matchType: 'partial',
						};
					});
					this.allArticlesPaginator.setFilters(newFilters);
					this.featuredArticlesPaginator.setFilters(newFilters);

					this._router.navigate([], {
						queryParams: { articleSearchPattern: controls.title },
						queryParamsHandling: 'merge',
					});
				})
			)
			.subscribe();

		// get articleSearchPattern from the URL and update the articleFiltersForm if needed
		effect(() => {
			const articleSearchPattern = this.articleSearchPattern();
			if (articleSearchPattern) {
				this.articleFiltersForm.get('title')?.setValue(articleSearchPattern);
			}
		});

		// if explicitArticles is set, use it to build a custom request fn
		effect(() => {
			const explicitAllArticles = this.explicitAllArticles();
			if (explicitAllArticles) {
				this.allArticlesPaginator.setRequestFn(createLocalRequestFn<Article>(explicitAllArticles));
				console.log('explicitAllArticles', explicitAllArticles);
			}
		});

		// if sourceFolderId is set, use it to build a custom request fn
		effect(() => {
			const sourceFolderId = this.sourceFolderId();
			if (sourceFolderId) {
				// 1 - get the folder public
				this._requestService
					.getBasic$<{
						filteredResources: { article?: Article[] };
					}>('/api/folders/' + sourceFolderId + '/public_resources')
					.pipe(
						tap((response) => {
							console.log('response', response);

							if (response.result?.filteredResources?.article) {
								const publishedArticles = filterPublishedFolderArticles(response.result.filteredResources.article);
								// 2 - set the explicit articles
								this.explicitAllArticles.set(publishedArticles);
								// 3 - set the featured articles
								this.explicitFeaturedArticles.set(
									publishedArticles.filter((article) => {
										return article.featured;
									})
								);
							}
						})
					)
					.subscribe();
			}
		});

		// if explicitFeaturedArticles is set, use it to build a custom request fn
		effect(() => {
			const explicitFeaturedArticles = this.explicitFeaturedArticles();
			if (explicitFeaturedArticles) {
				this.featuredArticlesPaginator.setRequestFn(createLocalRequestFn<Article>(explicitFeaturedArticles));
				this.featuredArticlesPaginator.setOrderingBy('time_published', 'desc');
			}
		});

		// react to filter changes
		this.filterByFields$_.$.pipe(
			takeUntilDestroyed(),
			tap((controls) => {
				console.log('filterByFields$_', controls);
			}),
			debounceTime(300),
			tap((controls) => {
				const newFilters: Filter[] = Object.entries(controls).map((keyvalue) => {
					return {
						fieldName: keyvalue[0],
						value: keyvalue[1],
						matchType: 'partial',
					};
				});
				this.allArticlesPaginator.setFilters(newFilters);
				this.featuredArticlesPaginator.setFilters(newFilters);
			})
		).subscribe();

		// request the first page of article paginator
		this._articlesRepository.store.objects$$$
			.pipe(
				takeUntilDestroyed(),
				switchMap(() => this.allArticlesPaginator.refresh() ?? of(null))
			)
			.subscribe();
	}

	public openArticle(articleId: string | null) {
		this._router.navigate(['/', 'host', 'dashboard', 'articles', articleId, 'builder']);
	}

	public convertToUrl = convertToUrl;

	segmentPath = input.required<string>();
	public goToArticle(articleIdentifier: string) {
		const currentUrl = this._router.url;
		const segmentPath = this.segmentPath();
		const segments = currentUrl.split('/');
		const index = segments.indexOf(segmentPath);
		console.log({
			currentUrl,
			segmentPath,
			segments,
			index,
			articleIdentifier,
		});

		if (index !== -1) {
			// Remove everything after the segmentPath
			segments.splice(index + 1, segments.length - index - 1);
			// Add the new articleIdentifier
			segments.push(articleIdentifier);
			// Join the segments back into a URL
			const newUrl = segments.join('/');
			this._router.navigateByUrl(newUrl);
		}

		// scroll to #article-display
		const articleDisplayElement = document.getElementById('article-display');
		if (articleDisplayElement) {
			articleDisplayElement.scrollIntoView({ behavior: 'smooth' });
		}
	}
}
