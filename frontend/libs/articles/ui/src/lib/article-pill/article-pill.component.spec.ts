import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { ArticlesRepository } from '@foundation/articles/state';
import { ArticlePillComponent } from './article-pill.component';

describe('article-pill.component', () => {
	const article = {
		id: 'article-1',
		kind: 'default' as const,
		title: 'A very long article title',
		summary: 'Summary fallback',
		featured: false,
		draft: true,
		tags: [],
		config: {},
	};

	beforeEach(() => {
		TestBed.configureTestingModule({
			providers: [
				{
					provide: ArticlesRepository,
					useValue: {
						store: {
							getObjectById$$$: vi.fn(() => of(article)),
						},
					},
				},
			],
		});
	});

	it('loads an article title from an input article id', () => {
		const fixture = TestBed.createComponent(ArticlePillComponent);

		fixture.componentRef.setInput('articleId', 'article-1');
		fixture.detectChanges();

		expect(fixture.componentInstance.articleTitle()).toBe('A very long article title');
	});

	it('falls back to summary then truncates according to maxLength', () => {
		TestBed.overrideProvider(ArticlesRepository, {
			useValue: {
				store: {
					getObjectById$$$: vi.fn(() =>
						of({ ...article, title: undefined, summary: 'Summary fallback that is long' })
					),
				},
			},
		});
		const fixture = TestBed.createComponent(ArticlePillComponent);

		fixture.componentRef.setInput('articleId', 'article-1');
		fixture.componentRef.setInput('maxLength', 7);
		fixture.detectChanges();

		expect(fixture.componentInstance.articleTitleTruncated()).toBe('Summary...');
	});

	it('uses "No title" when neither title nor summary is available', () => {
		TestBed.overrideProvider(ArticlesRepository, {
			useValue: {
				store: {
					getObjectById$$$: vi.fn(() => of({ ...article, title: undefined, summary: undefined })),
				},
			},
		});
		const fixture = TestBed.createComponent(ArticlePillComponent);

		fixture.componentRef.setInput('articleId', 'article-1');
		fixture.detectChanges();

		expect(fixture.componentInstance.articleTitle()).toBe('No title');
	});
});
