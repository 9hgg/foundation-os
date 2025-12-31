import { Article } from '@foundation/articles/models';
import { ArticlesRepository } from '@foundation/articles/state';
import { Component, computed, effect, inject, input, model, OnDestroy } from '@angular/core';
import { filter, take, tap, takeUntil } from 'rxjs';
import { Subject } from 'rxjs';

@Component({
	selector: 'lib-article-pill',
	templateUrl: './article-pill.component.html',
	styleUrl: './article-pill.component.css',
	standalone: true,
})
export class ArticlePillComponent implements OnDestroy {
	private _articlesRepository = inject(ArticlesRepository);
	private destroyed$ = new Subject<void>();

	maxLength = input<number | null>(30);

	article = input<Article | null>(null);
	articleId = input<string | null>(null);

	articleTitle = model<string>('');

	articleTitleTruncated = computed(() => {
		const title = this.articleTitle();
		const maxLength = this.maxLength();
		if (maxLength && title.length > maxLength) {
			return title.substring(0, maxLength) + '...';
		}
		return title;
	});

	constructor() {
		effect(() => {
			const articleId = this.articleId();
			const article = this.article();
			const articleId_ = articleId ?? article?.id ?? null;

			if (!articleId_) return;

			this._articlesRepository.store
				.getObjectById$$$(articleId_, true)
				.pipe(
					filter((a) => !!a),
					take(1),
					takeUntil(this.destroyed$),
					tap((a) => {
						this.articleTitle.set((a.title ?? (a.summary ? a.summary.substring(0, 50) : '')) || 'No title');
					})
				)
				.subscribe();
		});
	}

	ngOnDestroy(): void {
		this.destroyed$.next();
		this.destroyed$.complete();
	}
}
