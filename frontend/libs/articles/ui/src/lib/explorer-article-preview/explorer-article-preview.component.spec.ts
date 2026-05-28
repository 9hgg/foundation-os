import '@angular/compiler';
import { TestBed } from '@angular/core/testing';
import { ExplorerArticlePreviewComponent } from './explorer-article-preview.component';

describe('explorer-article-preview.component', () => {
	const article = {
		id: 'article-1',
		kind: 'default' as const,
		title: 'A useful article',
		slug: 'useful-article',
		summary: 'Short summary',
		featured: true,
		draft: false,
		tags: ['one', 'two', 'three', 'four', 'five'],
		config: {
			commentsEnabled: true,
			images: {
				thumbnail: { alt: 'Preview', entityFileId: 'file-1' },
			},
		},
	};

	it('limits visible tags to the first four', () => {
		const fixture = TestBed.createComponent(ExplorerArticlePreviewComponent);

		fixture.componentRef.setInput('resource', article);
		fixture.detectChanges();

		expect(fixture.componentInstance.visibleTags()).toEqual(['one', 'two', 'three', 'four']);
	});

	it('detects whether the article has a thumbnail', () => {
		const fixture = TestBed.createComponent(ExplorerArticlePreviewComponent);

		fixture.componentRef.setInput('resource', article);
		fixture.detectChanges();

		expect(fixture.componentInstance.hasThumbnail()).toBe(true);
	});

	it('falls back to no tags and no thumbnail without a resource', () => {
		const fixture = TestBed.createComponent(ExplorerArticlePreviewComponent);

		expect(fixture.componentInstance.visibleTags()).toEqual([]);
		expect(fixture.componentInstance.hasThumbnail()).toBe(false);
	});
});
