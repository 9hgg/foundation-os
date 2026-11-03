import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { ArticlesRepository } from '@foundation/articles/state';
import { ConversationsRepository } from '@foundation/conversations/state';
import { MessagesRepository } from '@foundation/messages/state';
import { RequestService } from '@foundation/network/services';
import { NotificationService } from '@foundation/notification';
import { TranslationService } from '@foundation/translations/services';
import { UsersRepository } from '@foundation/users/state';
import { of, Subject, throwError } from 'rxjs';
import { McpAssistantConversationService } from './mcp-assistant-conversation.service';

describe('McpAssistantConversationService', () => {
	const router = { navigateByUrl: vi.fn() };
	const requestService = { post$: vi.fn().mockReturnValue(of({ result: {} })) };
	const articlesRepository = { store: { postObject$: vi.fn() } };
	const conversationsRepository = { createConversationFor$: vi.fn() };
	const messagesRepository = { store: { save: vi.fn() } };
	const usersRepository = { currentProfile: vi.fn() };
	const notificationService = { promptTextarea: vi.fn(), error: vi.fn() };

	const article = { id: 'article-1' };
	const conversation = { id: 'conversation-1' };
	const message = { id: 'message-1' };

	function build() {
		TestBed.configureTestingModule({
			providers: [
				{ provide: Router, useValue: router },
				{ provide: RequestService, useValue: requestService },
				{ provide: ArticlesRepository, useValue: articlesRepository },
				{ provide: ConversationsRepository, useValue: conversationsRepository },
				{ provide: MessagesRepository, useValue: messagesRepository },
				{ provide: UsersRepository, useValue: usersRepository },
				{ provide: NotificationService, useValue: notificationService },
				{ provide: TranslationService, useValue: { prep: () => () => 'translated' } },
			],
		});
		return TestBed.runInInjectionContext(() => new McpAssistantConversationService());
	}

	beforeEach(() => {
		vi.clearAllMocks();
		usersRepository.currentProfile.mockReturnValue({ id: 'user-1' });
		articlesRepository.store.postObject$.mockReturnValue(of({ result: { data: article } }));
		conversationsRepository.createConversationFor$.mockReturnValue(of(conversation));
		messagesRepository.store.save.mockReturnValue(of({ result: { data: message } }));
		requestService.post$.mockReturnValue(of({ result: {} }));
	});

	it('creates the article, conversation and first message, then navigates and kicks off processing', () => {
		const service = build();
		service.createNewArticle('  Help me plan a trip  ');

		expect(articlesRepository.store.postObject$).toHaveBeenCalledWith(expect.objectContaining({ kind: 'assistant', id: expect.any(String) }));
		expect(conversationsRepository.createConversationFor$).toHaveBeenCalledWith(expect.any(String), 'article', 'default');
		expect(messagesRepository.store.save).toHaveBeenCalledWith(expect.objectContaining({ content: 'Help me plan a trip', authorId: 'user-1', conversationId: conversation.id }));
		expect(router.navigateByUrl).toHaveBeenCalledWith('/host/dashboard/assistant/' + article.id);
		expect(requestService.post$).toHaveBeenCalledWith('/api/assistants/process/' + conversation.id, {});
		expect(notificationService.promptTextarea).not.toHaveBeenCalled();
	});

	it('prompts for a first message when none is given, and proceeds with the trimmed answer', () => {
		const closed$ = new Subject<{ value?: string } | undefined>();
		notificationService.promptTextarea.mockReturnValue({ closed: closed$ });

		const service = build();
		service.createNewArticle();
		closed$.next({ value: '  What is the plan?  ' });

		expect(messagesRepository.store.save).toHaveBeenCalledWith(expect.objectContaining({ content: 'What is the plan?' }));
		expect(router.navigateByUrl).toHaveBeenCalled();
	});

	it('does nothing when the prompt is dismissed', () => {
		const closed$ = new Subject<{ value?: string } | undefined>();
		notificationService.promptTextarea.mockReturnValue({ closed: closed$ });

		const service = build();
		service.createNewArticle();
		closed$.next(undefined);

		expect(articlesRepository.store.postObject$).not.toHaveBeenCalled();
		expect(router.navigateByUrl).not.toHaveBeenCalled();
	});

	it('does nothing when the prompt answer is blank', () => {
		const closed$ = new Subject<{ value?: string } | undefined>();
		notificationService.promptTextarea.mockReturnValue({ closed: closed$ });

		const service = build();
		service.createNewArticle();
		closed$.next({ value: '   ' });

		expect(articlesRepository.store.postObject$).not.toHaveBeenCalled();
	});

	it('notifies an error and does not navigate when the article fails to create', () => {
		articlesRepository.store.postObject$.mockReturnValue(of({ result: undefined }));
		const service = build();
		service.createNewArticle('hello');

		expect(notificationService.error).toHaveBeenCalledWith('translated', undefined, { width: '300px' });
		expect(router.navigateByUrl).not.toHaveBeenCalled();
	});

	it('notifies an error when the conversation cannot be created', () => {
		conversationsRepository.createConversationFor$.mockReturnValue(of(null));
		const service = build();
		service.createNewArticle('hello');

		expect(notificationService.error).toHaveBeenCalled();
		expect(messagesRepository.store.save).not.toHaveBeenCalled();
	});

	it('notifies an error when there is no current user to author the message', () => {
		usersRepository.currentProfile.mockReturnValue(undefined);
		const service = build();
		service.createNewArticle('hello');

		expect(notificationService.error).toHaveBeenCalled();
		expect(messagesRepository.store.save).not.toHaveBeenCalled();
	});

	it('notifies an error when the message fails to save', () => {
		messagesRepository.store.save.mockReturnValue(of({ result: undefined }));
		const service = build();
		service.createNewArticle('hello');

		expect(notificationService.error).toHaveBeenCalled();
		expect(router.navigateByUrl).not.toHaveBeenCalled();
	});

	it('notifies an error instead of throwing when the flow errors out', () => {
		articlesRepository.store.postObject$.mockReturnValue(throwError(() => new Error('boom')));
		const service = build();

		expect(() => service.createNewArticle('hello')).not.toThrow();
		expect(notificationService.error).toHaveBeenCalled();
	});
});
