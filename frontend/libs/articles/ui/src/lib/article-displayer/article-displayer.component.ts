import { Article } from '@foundation/articles/models';
import { ArticlesRepository } from '@foundation/articles/state';
import { ConversationDisplayerComponent } from '@foundation/conversations/ui';
import { TranslationsRepository } from '@foundation/translations/state';
import { TranslationService } from '@foundation/translations/services';
import { TranslationTableComponent } from '@foundation/translations/ui';
import { TranslatePipe, TranslateDirective } from '@foundation/translations/services';
import { NotificationService } from '@foundation/notification';
import { BehaviorSubjectReplayedProxied, SanitizeHtmlPipe } from '@foundation/utils';
import { PortalModule } from '@angular/cdk/portal';
import { CommonModule } from '@angular/common';
import { AfterViewInit, ChangeDetectionStrategy, Component, effect, inject, input, model } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterModule } from '@angular/router';
import { ChatDisplayerComponent } from '@foundation/conversations/ui';
import { filter, of, take, tap } from 'rxjs';

@Component({
	selector: 'lib-article-displayer',
	standalone: true,
	imports: [
		//
		CommonModule,
		TranslateDirective,
		RouterModule,
		PortalModule,
		SanitizeHtmlPipe,
		ConversationDisplayerComponent,
		ChatDisplayerComponent,
	],
	templateUrl: './article-displayer.component.html',
	styleUrls: ['./article-displayer.component.css'],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ArticleDisplayerComponent implements AfterViewInit {
	commentTitle = model<string | undefined>();
	addBottomMargin = model<boolean>(true);

	ngAfterViewInit() {
		// Listen for URL fragment changes and scroll to the message if present
		const fragment = window.location.hash;
		if (fragment && fragment.startsWith('#message-')) {
			// Wait for the view to render (in case the message is loaded asynchronously)
			let counter = 0;
			const interval = setInterval(() => {
				const el = document.querySelector<HTMLElement>(fragment);
				if (el) {
					el.classList.add('highlight-and-fade');
					el.scrollIntoView({ behavior: 'smooth', block: 'center' });
					clearInterval(interval);
				}
				if (counter >= 10) {
					clearInterval(interval);
					console.warn(`Element with ID ${fragment} not found after multiple attempts`);
				}
				counter++;
			}, 300);
		}
	}
	public notificationService = inject(NotificationService);

	article = model<Article | null>(null);

	private _articlesRepository = inject(ArticlesRepository);

	public articleId = input<string | null>(null);
	public articleSlug = input<string | null>(null);

	article$$$ = new BehaviorSubjectReplayedProxied<string | null, Article | null>((id: string | null) => {
		return id ? this._articlesRepository.store.getObjectById$$$(id, true).$ : of(null);
	}, null);

	private _translationService = inject(TranslationService);

	private _i18n_supportChat = this._translationService.prep('Support chat');
	private _i18n_backlog = this._translationService.prep('Feature request');
	private _i18n_comments = this._translationService.prep('Comments');

	constructor() {
		// react if the reference is the articleId
		effect(() => {
			const articleId = this.articleId();
			this.article$$$.next(articleId);
		});

		// react if the reference is the articleSlug
		effect(() => {
			const articleSlug = this.articleSlug();
			if (articleSlug) {
				this._articlesRepository.store
					.pullObjectBy$('slug', articleSlug)
					.pipe(take(1))
					.subscribe((response) => {
						if (response.result) {
							this.article$$$.next(response.result.data.id);
						} else {
							this.notificationService.error('Article not found');
						}
					});
			}
		});

		this.article$$$
			.pipe(
				takeUntilDestroyed(),
				filter((article): article is Article => !!article),
				tap((article) => {
					this.article.set(article);

					if (article.kind === 'support') {
						setTimeout(() => {
							this.scrollToBottomOfChat();
						}, 150);
					}

					if (!this.commentTitle())
						switch (article.kind) {
							case 'support':
								this.commentTitle.set(this._i18n_supportChat());
								break;
							case 'backlog':
								this.commentTitle.set(this._i18n_backlog());
								break;
							case 'default':
								this.commentTitle.set(this._i18n_comments());
								break;
							default:
								console.warn('Unsupported article kind:', article.kind);
								break;
						}
				})
			)
			.subscribe();
	}

	/**
	 * Scrolls to the bottom of the chat messages smoothly
	 */
	private scrollToBottomOfChat(): void {
		// Try to find the bottom anchor in the chat displayer
		const bottomAnchor = document.getElementById('bottom-anchor');
		if (bottomAnchor) {
			bottomAnchor.scrollIntoView({ behavior: 'smooth', block: 'start' });
		}
	}
}
