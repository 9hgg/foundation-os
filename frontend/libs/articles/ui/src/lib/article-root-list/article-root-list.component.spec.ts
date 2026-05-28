import { ArticleRootListComponent, filterPublishedFolderArticles } from './article-root-list.component';

describe('article-root-list.component', () => {
	const buildComponent = () => {
		const navigate = vi.fn();
		const navigateByUrl = vi.fn();
		const component = Object.create(ArticleRootListComponent.prototype) as ArticleRootListComponent;
		component['_router'] = {
			navigate,
			navigateByUrl,
			url: '/support/articles/old-article/comments',
		} as never;
		component.segmentPath = (() => 'articles') as never;
		return { component, navigate, navigateByUrl };
	};

	it('opens an article in the dashboard builder', () => {
		const { component, navigate } = buildComponent();

		component.openArticle('article-1');

		expect(navigate).toHaveBeenCalledWith([
			'/',
			'host',
			'dashboard',
			'articles',
			'article-1',
			'builder',
		]);
	});

	it('replaces the current article segment and scrolls to the display area', () => {
		const { component, navigateByUrl } = buildComponent();
		const scrollIntoView = vi.fn();
		vi.spyOn(document, 'getElementById').mockReturnValue({ scrollIntoView } as never);

		component.goToArticle('new-article');

		expect(navigateByUrl).toHaveBeenCalledWith('/support/articles/new-article');
		expect(document.getElementById).toHaveBeenCalledWith('article-display');
		expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth' });
	});

	it('does not navigate when the configured segment path is absent', () => {
		const { component, navigateByUrl } = buildComponent();
		component['_router'] = { navigateByUrl, url: '/other/path' } as never;

		component.goToArticle('new-article');

		expect(navigateByUrl).not.toHaveBeenCalled();
	});

	it('omits draft articles from folder-backed public rendering', () => {
		const articles = [
			{ id: 'draft', draft: true },
			{ id: 'published', draft: false },
		];

		expect(filterPublishedFolderArticles(articles)).toEqual([{ id: 'published', draft: false }]);
	});
});
