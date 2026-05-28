import { of } from 'rxjs';

import { ArticleTableComponent } from './article-table.component';

describe('article-table.component', () => {
	const article = {
		id: 'article-1',
		kind: 'default' as const,
		title: 'Old title',
		featured: false,
		draft: true,
		tags: [],
		config: {},
	};

	const buildComponent = () => {
		const refresh = vi.fn(() => of(null));
		const putObject$ = vi.fn(() => of({ result: {} }));
		const deleteObject$ = vi.fn(() => of({ result: {} }));
		const applyPatch = vi.fn(() => of({ result: {} }));
		const toggleAnonymousReadForObject$ = vi.fn(() => of({ result: [] }));
		const goToArticle = vi.fn();
		const getBasic$ = vi.fn(() => of({ result: {} }));
		const post$ = vi.fn(() => of({ result: {} }));
		const openFolderSelectionDialog = vi.fn(() => ({
			closed: of({ folders: [{ id: 'folder-1' }] }),
		}));
		const openSharingDetails = vi.fn();
		const shareWithTeam = vi.fn();
		const confirm = vi.fn(() => ({ closed: of(true) }));
		const component = Object.create(ArticleTableComponent.prototype) as ArticleTableComponent;

		component['_repository'] = {
			store: { putObject$, deleteObject$, applyPatch, toggleAnonymousReadForObject$ },
			goToArticle,
		} as never;
		component['_foldersModal'] = { openFolderSelectionDialog } as never;
		component['_accessService'] = { openSharingDetails, shareWithTeam } as never;
		component['_requestService'] = { getBasic$, post$ } as never;
		component['_notificationService'] = { confirm } as never;
		component['_i18n_renameSentence'] = () => 'Give it a new name:';
		component['_i18n_deleteSentence'] = () => 'Are you sure?';
		component.paginator = { refresh } as never;

		return {
			component,
			applyPatch,
			confirm,
			deleteObject$,
			getBasic$,
			post$,
			goToArticle,
			openFolderSelectionDialog,
			openSharingDetails,
			putObject$,
			refresh,
			shareWithTeam,
			toggleAnonymousReadForObject$,
		};
	};

	it('renames an article and refreshes the paginator', () => {
		const { component, putObject$, refresh } = buildComponent();
		vi.spyOn(window, 'prompt').mockReturnValue('New title');

		component.renameArticle(article);

		expect(putObject$).toHaveBeenCalledWith({ ...article, title: 'New title' });
		expect(refresh).toHaveBeenCalled();
	});

	it('skips rename when the prompt is cancelled', () => {
		const { component, putObject$ } = buildComponent();
		vi.spyOn(window, 'prompt').mockReturnValue(null);

		component.renameArticle(article);

		expect(putObject$).not.toHaveBeenCalled();
	});

	it('deletes an article only after confirmation', () => {
		const { component, confirm, deleteObject$, refresh } = buildComponent();

		component.deleteArticle(article);

		expect(confirm).toHaveBeenCalledWith('Are you sure?');
		expect(deleteObject$).toHaveBeenCalledWith('article-1');
		expect(refresh).toHaveBeenCalled();
	});

	it('skips deletion when confirmation is rejected', () => {
		const { component, confirm, deleteObject$ } = buildComponent();
		confirm.mockReturnValue({ closed: of(false) });

		component.deleteArticle(article);

		expect(deleteObject$).not.toHaveBeenCalled();
	});

	it('delegates navigation and sharing actions', () => {
		const { component, goToArticle, openSharingDetails, shareWithTeam } = buildComponent();

		component.goToArticle('article-1');
		component.shareArticle(article);
		component.shareArticleWithTeam(article);

		expect(goToArticle).toHaveBeenCalledWith('article-1');
		expect(openSharingDetails).toHaveBeenCalledWith('article-1', 'article');
		expect(shareWithTeam).toHaveBeenCalledWith('article-1', 'article');
	});

	it('adds the article to the selected folder', () => {
		const { component, getBasic$, openFolderSelectionDialog } = buildComponent();

		component.openFolderSelectionModalFor(article);

		expect(openFolderSelectionDialog).toHaveBeenCalled();
		expect(getBasic$).toHaveBeenCalledWith('/api/folders/folder-1/add/article/article-1');
	});

	it('uses the admin article endpoint for folder assignment in admin mode', () => {
		const { component, post$ } = buildComponent();
		component.adminMode = true;

		component.openFolderSelectionModalFor(article);

		expect(post$).toHaveBeenCalledWith('/api/articles/admin/article-1/folder', { folderId: 'folder-1' });
	});

	it('updates each independent admin article setting', () => {
		const { component, applyPatch, toggleAnonymousReadForObject$, refresh } = buildComponent();

		component.updateKind(article, 'assistant');
		component.toggleDraft(article);
		component.toggleFeatured(article);
		component.togglePublic(article);

		expect(applyPatch).toHaveBeenCalledWith('article-1', { kind: 'assistant' });
		expect(applyPatch).toHaveBeenCalledWith('article-1', { draft: false });
		expect(applyPatch).toHaveBeenCalledWith('article-1', { featured: true });
		expect(toggleAnonymousReadForObject$).toHaveBeenCalledWith('article-1');
		expect(refresh).toHaveBeenCalledTimes(4);
	});
});
