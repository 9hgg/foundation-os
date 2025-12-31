import { ChangeDetectionStrategy, Component, model } from '@angular/core';

@Component({
	selector: 'lib-no-article-page',
	standalone: true,
	imports: [],
	templateUrl: './no-article-page.component.html',
	changeDetection: ChangeDetectionStrategy.OnPush,
	host: { class: 'page-host' },
})
export class NoArticlePageComponent {
	public articleId = model<string | null>(null);

	constructor() {}
}
