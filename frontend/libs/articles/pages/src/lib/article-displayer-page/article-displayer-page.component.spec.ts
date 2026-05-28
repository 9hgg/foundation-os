import { TestBed } from '@angular/core/testing';

import { ArticleDisplayerPageComponent } from './article-displayer-page.component';

describe('article-displayer-page.component', () => {
	it('exposes a nullable route-bound article id model', () => {
		const component = TestBed.runInInjectionContext(() => new ArticleDisplayerPageComponent());

		expect(component.articleId()).toBeNull();

		component.articleId.set('article-1');

		expect(component.articleId()).toBe('article-1');
	});

	it('accepts an optional comment title input', () => {
		const fixture = TestBed.createComponent(ArticleDisplayerPageComponent);

		fixture.componentRef.setInput('commentTitle', 'Discussion');
		fixture.detectChanges();

		expect(fixture.componentInstance.commentTitle()).toBe('Discussion');
	});

	it('uses the expected standalone selector and host class', () => {
		const metadata = ɵcmp(ArticleDisplayerPageComponent);

		expect(metadata.selectors).toEqual([['lib-article-displayer-page']]);
		expect(metadata.hostAttrs).toContain('page-host');
	});

	function ɵcmp(component: typeof ArticleDisplayerPageComponent) {
		return (component as never as { ɵcmp: { hostAttrs: unknown[]; selectors: unknown[] } }).ɵcmp;
	}
});
