import { TestBed } from '@angular/core/testing';
import { ConversationsRepository } from '@foundation/conversations/state';
import { of } from 'rxjs';

import { ArticlesRepository } from './articles.repository';
import { SupportService } from './support.service';

describe('SupportService', () => {
	const build = () => {
		const postObject$ = vi.fn((article) => of({ result: { data: article } }));
		const toggleAnonymousReadForObject$ = vi.fn(() => of({ result: [] }));
		const createConversationFor$ = vi.fn(() => of({ id: 'conversation-1' }));

		TestBed.configureTestingModule({
			providers: [
				SupportService,
				{ provide: ArticlesRepository, useValue: { store: { postObject$, toggleAnonymousReadForObject$ } } },
				{ provide: ConversationsRepository, useValue: { createConversationFor$ } },
			],
		});

		return { service: TestBed.inject(SupportService), postObject$, toggleAnonymousReadForObject$, createConversationFor$ };
	};

	afterEach(() => TestBed.resetTestingModule());

	it('names a ticket after the moment it was opened, in UTC', () => {
		const { service, postObject$ } = build();

		service.createTicket$('support').subscribe();

		const article = postObject$.mock.calls[0][0];
		expect(article.title).toMatch(/^Support request — \d{2}\/\d{2}\/\d{4} \d{2}:\d{2} UTC$/);
		expect(article).toMatchObject({ kind: 'support', draft: false, config: { commentsEnabled: true } });
	});

	it('keeps a caller-supplied title', () => {
		const { service, postObject$ } = build();

		service.createTicket$('support', 'Cannot log in').subscribe();

		expect(postObject$.mock.calls[0][0].title).toBe('Cannot log in');
	});

	// Two tickets opened in the same minute share a title, so the id is what keeps the slug unique.
	it('suffixes the slug with the article id', () => {
		const { service, postObject$ } = build();

		service.createTicket$('support', 'Cannot log in').subscribe();

		const article = postObject$.mock.calls[0][0];
		expect(article.slug).toBe(`cannot-log-in_${article.id}`);
	});

	it('opens a backlog item as a draft anyone can read', () => {
		const { service, postObject$, toggleAnonymousReadForObject$ } = build();

		service.createTicket$('backlog').subscribe();

		const article = postObject$.mock.calls[0][0];
		expect(article.draft).toBe(true);
		expect(toggleAnonymousReadForObject$).toHaveBeenCalledWith(article.id);
	});

	it('keeps a support ticket private', () => {
		const { service, toggleAnonymousReadForObject$ } = build();

		service.createTicket$('support').subscribe();

		expect(toggleAnonymousReadForObject$).not.toHaveBeenCalled();
	});

	it('gives the ticket the conversation it is really about', () => {
		const { service, createConversationFor$, postObject$ } = build();

		service.createTicket$('support').subscribe();

		const article = postObject$.mock.calls[0][0];
		expect(createConversationFor$).toHaveBeenCalledWith(article.id, 'article', 'default');
	});

	it('emits the article once both halves exist', () => {
		const { service } = build();
		let emitted: unknown = 'nothing';

		service.createTicket$('support').subscribe((article) => (emitted = article));

		expect(emitted).toMatchObject({ kind: 'support' });
	});

	it('emits null when the article could not be created', () => {
		const { service, postObject$, createConversationFor$ } = build();
		postObject$.mockReturnValue(of({ result: null }));
		let emitted: unknown = 'nothing';

		service.createTicket$('support').subscribe((article) => (emitted = article));

		expect(emitted).toBeNull();
		expect(createConversationFor$).not.toHaveBeenCalled();
	});

	// A ticket nobody can reply to is worse than no ticket: it looks filed but goes nowhere.
	it('emits null when the conversation could not be created', () => {
		const { service, createConversationFor$ } = build();
		createConversationFor$.mockReturnValue(of(null));
		let emitted: unknown = 'nothing';

		service.createTicket$('support').subscribe((article) => (emitted = article));

		expect(emitted).toBeNull();
	});
});
