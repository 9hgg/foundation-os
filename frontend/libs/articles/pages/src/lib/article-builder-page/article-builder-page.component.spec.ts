import { signal } from '@angular/core';
import { of } from 'rxjs';

import { ArticleBuilderPageComponent } from './article-builder-page.component';

describe('article-builder-page.component', () => {
	const buildArticle = () => ({
		id: 'article-1',
		kind: 'default' as const,
		title: 'Original title',
		featured: false,
		draft: true,
		tags: ['existing'],
		config: {},
	});

	const buildComponent = (article = buildArticle()) => {
		const save = vi.fn();
		const getAclsForObject$ = vi.fn(() => of({ result: [] }));
		const toggleAnonymousReadForObject$ = vi.fn(() =>
			of({ result: [{ who: 'anonymous', operation: 'read' }] })
		);
		const goToArticle = vi.fn();
		const createConversationFor$ = vi.fn(() => of({ id: 'conversation-1' }));
		const component = Object.create(ArticleBuilderPageComponent.prototype) as ArticleBuilderPageComponent;

		component.article$$$ = { value: article } as never;
		component.acls = signal([]);
		component['_articlesRepository'] = {
			store: {
				save,
				getAclsForObject$,
				toggleAnonymousReadForObject$,
			},
			goToArticle,
		} as never;
		component['_conversationsRepository'] = { createConversationFor$ } as never;

		return {
			article,
			component,
			createConversationFor$,
			getAclsForObject$,
			goToArticle,
			save,
			toggleAnonymousReadForObject$,
		};
	};

	describe('article mutations', () => {
		it('updates featured state and persists the article', () => {
			const { article, component, save } = buildComponent();

			component.updateFeatured(true);

			expect(article.featured).toBe(true);
			expect(save).toHaveBeenCalledWith(article);
		});

		it('adds normalized unique tags and skips blanks or duplicates', () => {
			const { article, component, save } = buildComponent();

			component.addTag('  New Tag  ');
			component.addTag('new tag');
			component.addTag('   ');

			expect(article.tags).toEqual(['existing', 'new tag']);
			expect(save).toHaveBeenCalledTimes(1);
		});

		it('removes a tag and persists the article', () => {
			const { article, component, save } = buildComponent();

			component.removeTag('existing');

			expect(article.tags).toEqual([]);
			expect(save).toHaveBeenCalledWith(article);
		});
	});

	describe('thumbnail updates', () => {
		it('stores selected thumbnail metadata using the article title as alt text', () => {
			const { article, component, save } = buildComponent();

			component.updateThumbnail({ id: 'file-1' } as never);

			expect(article.config.images?.['thumbnail']).toEqual({
				alt: 'Original title',
				entityFileId: 'file-1',
			});
			expect(save).toHaveBeenCalledWith(article);
		});

		it('uses the first defined uploaded file for the thumbnail', () => {
			const { article, component } = buildComponent();

			component.processUploadedFilesForThumbnail([undefined, { id: 'file-2' } as never]);

			expect(article.config.images?.['thumbnail'].entityFileId).toBe('file-2');
		});
	});

	describe('publishing and comments', () => {
		it('publishes when draft status is toggled explicitly', () => {
			const { article, component, save } = buildComponent();

			component.toggleDraft();

			expect(article.draft).toBe(false);
			expect(article.timePublished).toBeInstanceOf(Date);
			expect(save).toHaveBeenCalledWith(article);
		});

		it('returns to draft when draft status is toggled explicitly', () => {
			const { article, component, save } = buildComponent({
				...buildArticle(),
				draft: false,
				timePublished: new Date('2026-04-01T10:00:00.000Z'),
			});

			component.toggleDraft();

			expect(article.draft).toBe(true);
			expect(article.timePublished).toBeUndefined();
			expect(save).toHaveBeenCalledWith(article);
		});

		it('changes anonymous access without changing draft status', () => {
			const { article, component, save, toggleAnonymousReadForObject$ } = buildComponent();

			component.togglePublic();

			expect(toggleAnonymousReadForObject$).toHaveBeenCalledWith('article-1');
			expect(article.draft).toBe(true);
			expect(save).not.toHaveBeenCalled();
		});

		it('stores ACLs returned for the current article', () => {
			const { component, getAclsForObject$ } = buildComponent();
			getAclsForObject$.mockReturnValue(
				of({ result: [{ who: 'anonymous', operation: 'read' }] })
			);

			component.updateAcls();

			expect(getAclsForObject$).toHaveBeenCalledWith('article-1');
			expect(component.acls()).toEqual([{ who: 'anonymous', operation: 'read' }]);
		});

		it('updates comments setting and creates a conversation when enabling comments', () => {
			const { article, component, createConversationFor$, save } = buildComponent();

			component.updateCommentsEnabled(true);

			expect(article.config.commentsEnabled).toBe(true);
			expect(save).toHaveBeenCalledWith(article);
			expect(createConversationFor$).toHaveBeenCalledWith('article-1', 'article', 'default');
		});

		it('does not create a conversation when disabling comments', () => {
			const { article, component, createConversationFor$ } = buildComponent();

			component.updateCommentsEnabled(false);

			expect(article.config.commentsEnabled).toBe(false);
			expect(createConversationFor$).not.toHaveBeenCalled();
		});
	});

	describe('navigation', () => {
		it('opens the article in a new tab through the repository', () => {
			const { component, goToArticle } = buildComponent();

			component.goToArticle('article-2');

			expect(goToArticle).toHaveBeenCalledWith('article-2', { inNewTab: true });
		});
	});
});
