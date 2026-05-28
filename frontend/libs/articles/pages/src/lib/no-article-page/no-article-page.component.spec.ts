import { TestBed } from '@angular/core/testing';

import { NoArticlePageComponent } from './no-article-page.component';

describe('no-article-page.component', () => {
	it('exposes a nullable route-bound article id model', () => {
		const component = TestBed.runInInjectionContext(() => new NoArticlePageComponent());

		expect(component.articleId()).toBeNull();

		component.articleId.set('missing-article');

		expect(component.articleId()).toBe('missing-article');
	});

	it('uses the expected standalone selector and host class', () => {
		const metadata = ɵcmp(NoArticlePageComponent);

		expect(metadata.selectors).toEqual([['lib-no-article-page']]);
		expect(metadata.hostAttrs).toContain('page-host');
	});

	function ɵcmp(component: typeof NoArticlePageComponent) {
		return (component as never as { ɵcmp: { hostAttrs: unknown[]; selectors: unknown[] } }).ɵcmp;
	}
});
