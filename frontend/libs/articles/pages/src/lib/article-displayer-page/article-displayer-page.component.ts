import { ArticleDisplayerComponent } from '@foundation/articles/ui';

import { ChangeDetectionStrategy, Component, input, model } from '@angular/core';

/**
 * ArticleDisplayerPageComponent
 * This component is responsible for displaying a single article based on the articleId.
 * Using the `model` function, it binds the articleId to the route parameters.
 */
@Component({
	selector: 'lib-article-displayer-page',
	standalone: true,
	imports: [ArticleDisplayerComponent],
	templateUrl: './article-displayer-page.component.html',
	styleUrls: ['./article-displayer-page.component.css'],
	changeDetection: ChangeDetectionStrategy.OnPush,
	host: { class: 'page-host' },
})
export class ArticleDisplayerPageComponent {
	public articleId = model<string | null>(null);

	commentTitle = input<string | undefined>();
}
