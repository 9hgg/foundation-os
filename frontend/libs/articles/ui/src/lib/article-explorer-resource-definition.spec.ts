import { of } from 'rxjs';
import { createArticleExplorerResourceDefinition } from './article-explorer-resource-definition';

describe('createArticleExplorerResourceDefinition', () => {
	const article = {
		id: 'article-1',
		kind: 'default' as const,
		title: 'A useful article',
		slug: 'useful-article',
		featured: false,
		draft: true,
		tags: [],
		config: {},
	};

	const buildDefinition = () => {
		const createNewArticle$ = vi.fn(() => of({ result: { data: { id: 'created-article' } } }));
		const getObjectByIdPullOnce$$$ = vi.fn(() => ({ $: of(article) }));
		const open = vi.fn();
		const definition = createArticleExplorerResourceDefinition(
			{
				createNewArticle$,
				store: { getObjectByIdPullOnce$$$ },
			} as never,
			{ open } as never
		);

		return { createNewArticle$, definition, getObjectByIdPullOnce$$$, open };
	};

	it('defines the article explorer resource contract', () => {
		const { definition } = buildDefinition();

		expect(definition.kind).toBe('article');
		expect(definition.getName(article)).toBe('A useful article');
		expect(definition.getName({ ...article, title: undefined })).toBe('useful-article');
		expect(definition.getName({ ...article, title: undefined, slug: undefined })).toBe(
			'Unknown article'
		);
		expect(definition.viewLink(article)).toEqual(['/host/dashboard/articles', 'article-1']);
		expect(definition.actions[0].label).toBe('Edit');
	});

	it('loads articles through the repository and opens share details in a dialog', () => {
		const { definition, getObjectByIdPullOnce$$$, open } = buildDefinition();
		let loaded: unknown;

		definition.load('article-1').subscribe((value) => (loaded = value));
		definition.onShare(article);

		expect(getObjectByIdPullOnce$$$).toHaveBeenCalledWith('article-1');
		expect(loaded).toEqual(article);
		expect(open).toHaveBeenCalledWith(expect.any(Function), {
			data: { resourceId: 'article-1', resourceKind: 'article' },
		});
	});

	it('opens edit and create actions in the article builder', () => {
		const { createNewArticle$, definition } = buildDefinition();
		const open = vi.spyOn(window, 'open').mockImplementation(() => null);

		definition.actions[0].onClick(article);
		definition.createAction?.onClick('folder-1').subscribe();

		expect(open).toHaveBeenCalledWith('/host/dashboard/articles/article-1/builder', '_blank');
		expect(createNewArticle$).toHaveBeenCalledWith('folder-1');
		expect(open).toHaveBeenCalledWith('/host/dashboard/articles/created-article/builder', '_blank');
	});
});
