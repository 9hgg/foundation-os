import { of } from 'rxjs';

import { SupportListPageComponent } from './support-list-page.component';

describe('support-list-page.component', () => {
	const buildComponent = () => {
		const prompt = vi.fn(() => ({ closed: of({ value: 'Need Help' }) }));
		const notify = vi.fn();
		const postObject$ = vi.fn((article) => of({ result: { data: article } }));
		const toggleAnonymousReadForObject$ = vi.fn(() => of({ result: [] }));
		const createConversationFor$ = vi.fn(() => of({ id: 'conversation-1' }));
		const navigateByUrl = vi.fn();
		const component = Object.create(SupportListPageComponent.prototype) as SupportListPageComponent;

		component['_notificationService'] = { prompt, notify } as never;
		component['_articlesRepository'] = { store: { postObject$, toggleAnonymousReadForObject$ } } as never;
		component['_conversationsRepository'] = { createConversationFor$ } as never;
		component['_router'] = { navigateByUrl } as never;
		component['_i18n_createNewArticleSentence'] = () => 'Give a name to your request:';
		component.appConfigService = {
			config$_: { environment: { support: { email: 'support@example.test' } } },
		} as never;

		return { component, createConversationFor$, navigateByUrl, notify, postObject$, prompt, toggleAnonymousReadForObject$ };
	};

	it('creates a backlog request as a draft article with comments enabled', () => {
		const { component, createConversationFor$, navigateByUrl, postObject$, prompt, toggleAnonymousReadForObject$ } = buildComponent();

		component.createNewArticle('backlog');

		const article = postObject$.mock.calls[0][0];
		expect(prompt).toHaveBeenCalledWith(undefined, 'Give a name to your request:', {
			width: '300px',
		});
		expect(article).toMatchObject({
			kind: 'backlog',
			title: 'Need Help',
			featured: false,
			draft: true,
			tags: [],
			config: { commentsEnabled: true },
		});
		expect(article.slug).toMatch(/^need-help_/);
		expect(toggleAnonymousReadForObject$).toHaveBeenCalledWith(article.id);
		expect(createConversationFor$).toHaveBeenCalledWith(article.id, 'article', 'default');
		expect(navigateByUrl).toHaveBeenCalledWith(`/host/dashboard/support/${article.id}`);
	});

	it('creates a support request as published private ticket content', () => {
		const { component, postObject$, toggleAnonymousReadForObject$ } = buildComponent();

		component.createNewArticle('support');

		expect(postObject$.mock.calls[0][0]).toMatchObject({
			kind: 'support',
			draft: false,
		});
		expect(toggleAnonymousReadForObject$).not.toHaveBeenCalled();
	});

	it('does not create a request when prompt is cancelled or empty', () => {
		const { component, postObject$, prompt } = buildComponent();
		prompt.mockReturnValueOnce({ closed: of(null) });
		component.createNewArticle('support');
		prompt.mockReturnValueOnce({ closed: of({ value: '' }) });
		component.createNewArticle('backlog');

		expect(postObject$).not.toHaveBeenCalled();
	});

	it('navigates to support destinations', () => {
		const { component, navigateByUrl } = buildComponent();

		component.goToArticle('article-1');
		component.goToKnowledgeBase();
		component.goToFaq();

		expect(navigateByUrl).toHaveBeenCalledWith('/host/dashboard/support/article-1');
		expect(navigateByUrl).toHaveBeenCalledWith('/support/articles');
		expect(navigateByUrl).toHaveBeenCalledWith('/faq');
	});

	it('copies the configured support email and notifies success', async () => {
		const { component, notify } = buildComponent();
		const writeText = vi.fn(() => Promise.resolve());
		Object.defineProperty(navigator, 'clipboard', {
			configurable: true,
			value: { writeText },
		});

		component.copyEmail();
		await Promise.resolve();

		expect(writeText).toHaveBeenCalledWith('support@example.test');
		expect(notify).toHaveBeenCalledWith('Email copied to clipboard!', 'success');
	});

	it('notifies when no support email is configured', () => {
		const { component, notify } = buildComponent();
		component.appConfigService = { config$_: { environment: { support: {} } } } as never;

		component.copyEmail();

		expect(notify).toHaveBeenCalledWith('Email not available', 'error');
	});
});
