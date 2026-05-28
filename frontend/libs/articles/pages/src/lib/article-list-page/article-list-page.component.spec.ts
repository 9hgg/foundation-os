import { of } from 'rxjs';

import { ArticleListPageComponent } from './article-list-page.component';

describe('article-list-page.component', () => {
	const buildComponent = () => {
		const prompt = vi.fn(() => ({ closed: of({ value: 'My New Article' }) }));
		const isSlugAvailable$ = vi.fn(() => of({ result: { slugAvailable: true } }));
		const postObject$ = vi.fn((article) => of({ result: { data: article } }));
		const navigateByUrl = vi.fn();
		const goToArticle = vi.fn();
		const component = Object.create(ArticleListPageComponent.prototype) as ArticleListPageComponent;

		component['_notificationService'] = { prompt } as never;
		component['_articlesRepository'] = {
			isSlugAvailable$,
			store: { postObject$ },
			goToArticle,
		} as never;
		component['_router'] = { navigateByUrl } as never;
		component['_i18n_createNewArticleSentence'] = () => 'Give a name to your new article:';

		return { component, goToArticle, isSlugAvailable$, navigateByUrl, postObject$, prompt };
	};

	it('creates a draft article with a unique slug and navigates to the builder', () => {
		const { component, isSlugAvailable$, navigateByUrl, postObject$, prompt } = buildComponent();

		component.createNewArticle();

		const article = postObject$.mock.calls[0][0];
		expect(prompt).toHaveBeenCalledWith(undefined, 'Give a name to your new article:', {
			width: '300px',
		});
		expect(isSlugAvailable$).toHaveBeenCalledWith('my-new-article');
		expect(article).toMatchObject({
			kind: 'default',
			title: 'My New Article',
			slug: 'my-new-article',
			featured: false,
			draft: true,
			tags: [],
			config: {},
		});
		expect(navigateByUrl).toHaveBeenCalledWith(
			`/host/dashboard/articles/${article.id}/builder`
		);
	});

	it('adds a timestamp suffix when the requested slug is already taken', () => {
		const { component, isSlugAvailable$, postObject$ } = buildComponent();
		vi.spyOn(Date, 'now').mockReturnValue(1_777_777);
		isSlugAvailable$.mockReturnValue(of({ result: { slugAvailable: false } }));

		component.createNewArticle();

		expect(postObject$.mock.calls[0][0].slug).toBe('my-new-article-1777777');
	});

	it('does not create an article when the prompt is cancelled or empty', () => {
		const { component, postObject$, prompt } = buildComponent();
		prompt.mockReturnValueOnce({ closed: of(null) });
		component.createNewArticle();
		prompt.mockReturnValueOnce({ closed: of({ value: '' }) });
		component.createNewArticle();

		expect(postObject$).not.toHaveBeenCalled();
	});

	it('delegates article navigation to the repository in editor mode', () => {
		const { component, goToArticle } = buildComponent();

		component.goToArticle('article-7');

		expect(goToArticle).toHaveBeenCalledWith('article-7', { toEditor: true });
	});
});
