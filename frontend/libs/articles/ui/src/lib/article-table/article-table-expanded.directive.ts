import { Directive, inject, TemplateRef } from '@angular/core';
import { Article } from '@foundation/articles/models';

export interface ArticleTableExpandedContext {
	$implicit: Article;
	item: Article;
}

@Directive({
	selector: 'ng-template[libArticleTableExpanded]',
})
export class ArticleTableExpandedDirective {
	public readonly templateRef = inject(TemplateRef<ArticleTableExpandedContext>);

	static ngTemplateContextGuard(_directive: ArticleTableExpandedDirective, context: unknown): context is ArticleTableExpandedContext {
		return context !== null && typeof context === 'object';
	}
}
