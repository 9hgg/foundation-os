import { TestBed } from '@angular/core/testing';
import { ChatDisplayerComponent } from './chat-displayer.component';
import { NotificationService } from '@foundation/notification';
import { ConversationsRepository } from '@foundation/conversations/state';
import { MessagesRepository } from '@foundation/messages/state';
import { UsersRepository } from '@foundation/users/state';
import { AccessService } from '@foundation/shared/access';
import { Router } from '@angular/router';
import { TranslationService } from '@foundation/translations/services';
import { RequestService } from '@foundation/network/services';
import { NEVER, of, throwError } from 'rxjs';
import { ComponentRef } from '@angular/core';
import { ConversationDisplayerComponent } from '../conversation-displayer/conversation-displayer.component';

vi.mock('uuid', () => ({ v4: () => 'mock-uuid' }));

const notificationMock = {
	snack: vi.fn(),
	snackSuccess: vi.fn(),
	snackError: vi.fn(),
	confirm: vi.fn().mockReturnValue({ closed: of(true) }),
};

const conversationsRepoMock = {
	store: {
		getObjectById$$$: vi.fn().mockReturnValue({ $: of(null) }),
		getObjectByIdPullOnce$$$: vi.fn().mockReturnValue({ $: of(null) }),
	},
	getConversationFor$: vi.fn().mockReturnValue(of(null)),
};

const messagesRepoMock = {
	store: {
		getObjects$: vi.fn().mockReturnValue(of({ data: [], totalCount: 0, page: 1, hasNext: false, hasPrev: false, self: '', all: '', next: '', prev: '' })),
		postObject$: vi.fn().mockReturnValue(of({ result: { data: { id: 'msg-1' } } })),
	},
	convenientListOfExtraMessages: vi.fn().mockReturnValue({}),
	fetchMessagesDetails: vi.fn(),
};

const usersRepoMock = {
	currentProfile: vi.fn().mockReturnValue({ id: 'user-1', email: 'test@test.com' }),
	userIdsToDetails: vi.fn().mockReturnValue({}),
	fetchAndCacheUserDetails: vi.fn(),
	fetchUsersDetails: vi.fn(),
};

const accessServiceMock = {
	checkAdmin$: vi.fn().mockReturnValue(of(false)),
};

const routerMock = {
	events: of(),
	navigate: vi.fn(),
	url: '/',
};
const translationMock = {
	prep: vi.fn().mockReturnValue(() => 'translated'),
	instant: vi.fn().mockReturnValue('translated'),
	translate$: vi.fn().mockReturnValue(of('translated')),
};

const assistantState = (status: string, progress = 0) => ({
	result: { conversationId: 'conv-1', taskId: 'task-1', status, messageId: null, error: null, progress },
});

const requestServiceMock = {
	clearCache$: NEVER,
	getBasic$: vi.fn().mockReturnValue(of(assistantState('idle'))),
	post$: vi.fn().mockReturnValue(of(assistantState('done'))),
};

describe('ChatDisplayerComponent', () => {
	let component: ChatDisplayerComponent;
	let componentRef: ComponentRef<ChatDisplayerComponent>;

	beforeEach(() => {
		vi.clearAllMocks();
		requestServiceMock.getBasic$.mockReturnValue(of(assistantState('idle')));
		requestServiceMock.post$.mockReturnValue(of(assistantState('done')));
		TestBed.configureTestingModule({
			imports: [ChatDisplayerComponent],
			providers: [
				{ provide: NotificationService, useValue: notificationMock },
				{ provide: ConversationsRepository, useValue: conversationsRepoMock },
				{ provide: MessagesRepository, useValue: messagesRepoMock },
				{ provide: UsersRepository, useValue: usersRepoMock },
				{ provide: AccessService, useValue: accessServiceMock },
				{ provide: Router, useValue: routerMock },
				{ provide: TranslationService, useValue: translationMock },
				{ provide: RequestService, useValue: requestServiceMock },
			],
		});
		const fixture = TestBed.createComponent(ChatDisplayerComponent);
		componentRef = fixture.componentRef;
		componentRef.setInput('resourceKind', 'article');
		componentRef.setInput('resourceId', 'res-1');
		component = fixture.componentInstance;
		fixture.detectChanges();
	});

	it('should be created', () => {
		expect(component).toBeTruthy();
	});

	it('should have chat-specific default text', () => {
		expect(component.commentLabelText()).toBe('Your message');
		expect(component.commentPlaceholderText()).toBe('Type your message...');
		expect(component.commentButtonText()).toBe('Send');
	});

	it('should have isSubmittingMessage false by default', () => {
		expect(component.isSubmittingMessage()).toBe(false);
	});

	describe('onEnterKeyDown', () => {
		it('does nothing on shift+enter', () => {
			const event = new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true });
			const spy = vi.spyOn(event, 'preventDefault');
			component.onEnterKeyDown(event);
			expect(spy).not.toHaveBeenCalled();
		});

		it('prevents default on enter without content', () => {
			const event = new KeyboardEvent('keydown', { key: 'Enter' });
			const spy = vi.spyOn(event, 'preventDefault');
			component.newCommentContent.set('');
			component.onEnterKeyDown(event);
			expect(spy).toHaveBeenCalled();
		});

		it('posts non-empty content on enter', () => {
			const event = new KeyboardEvent('keydown', { key: 'Enter' });
			const postSpy = vi.spyOn(component, 'postComment').mockImplementation(() => undefined);
			component.newCommentContent.set('Hello');

			component.onEnterKeyDown(event);

			expect(postSpy).toHaveBeenCalledOnce();
		});

		it('does not post while another submission is active', () => {
			const event = new KeyboardEvent('keydown', { key: 'Enter' });
			const postSpy = vi.spyOn(component, 'postComment').mockImplementation(() => undefined);
			component.newCommentContent.set('Hello');
			component.isSubmittingMessage.set(true);

			component.onEnterKeyDown(event);

			expect(postSpy).not.toHaveBeenCalled();
		});
	});

	describe('hasMoreMessages', () => {
		it('compares the total count with the current page size', () => {
			component.messagesPaginator.totalNumberOfItems$$$.next(11);
			component.messagesPaginator.numberOfItemsPerPage$$$.next(10);
			expect(component.hasMoreMessages()).toBe(true);

			component.messagesPaginator.totalNumberOfItems$$$.next(10);
			expect(component.hasMoreMessages()).toBe(false);
		});
	});

	describe('showMoreMessages', () => {
		it('increases the page size by ten', () => {
			component.messagesPaginator.numberOfItemsPerPage$$$.next(20);
			const setPageSize = vi.spyOn(component.messagesPaginator, 'setPageSize');

			component.showMoreMessages();

			expect(setPageSize).toHaveBeenCalledWith(30);
		});
	});

	describe('isFromCurrentUser', () => {
		it('returns a function', () => {
			expect(typeof component.isFromCurrentUser()).toBe('function');
		});

		it('returns true for current user id', () => {
			expect(component.isFromCurrentUser()('user-1')).toBe(true);
		});

		it('returns false for other user id', () => {
			expect(component.isFromCurrentUser()('user-other')).toBe(false);
		});
	});

	describe('postComment', () => {
		it('guards empty and duplicate submissions', () => {
			const parentPost = vi.spyOn(ConversationDisplayerComponent.prototype, 'postComment').mockImplementation(() => undefined);
			component.newCommentContent.set('   ');
			component.postComment();
			component.newCommentContent.set('Hello');
			component.isSubmittingMessage.set(true);
			component.postComment();

			expect(parentPost).not.toHaveBeenCalled();
		});

		it('delegates to the conversation displayer and releases its submission lock', () => {
			vi.useFakeTimers();
			const parentPost = vi.spyOn(ConversationDisplayerComponent.prototype, 'postComment').mockImplementation(() => undefined);
			component.newCommentContent.set('Hello');

			component.postComment();

			expect(parentPost).toHaveBeenCalledOnce();
			expect(component.isSubmittingMessage()).toBe(true);
			vi.advanceTimersByTime(500);
			expect(component.isSubmittingMessage()).toBe(false);
			vi.useRealTimers();
		});

		it('launches assistant processing after posting when enabled', () => {
			vi.useFakeTimers();
			vi.spyOn(ConversationDisplayerComponent.prototype, 'postComment').mockImplementation(() => undefined);
			componentRef.setInput('assistantEnabled', true);
			component.conversation$$$.$$$.next({ id: 'conv-1', config: {} } as never);
			component.newCommentContent.set('Hello');

			component.postComment();
			vi.advanceTimersByTime(800);

			expect(requestServiceMock.post$).toHaveBeenCalledWith('/api/assistants/process/conv-1', {});
			vi.useRealTimers();
		});
	});

	describe('assistant lifecycle', () => {
		it('refreshes messages when a launch completes immediately', () => {
			const refresh = vi.spyOn(component.messagesPaginator, 'refresh');

			(component as any)._launchAssistantProcessing('conv-1');

			expect(component.isAssistantProcessing()).toBe(false);
			expect(refresh).toHaveBeenCalledOnce();
		});

		it.each(['failed', 'stalled'])('stops processing when launch status is %s', (status) => {
			requestServiceMock.post$.mockReturnValue(of(assistantState(status)));

			(component as any)._launchAssistantProcessing('conv-1');

			expect(component.isAssistantProcessing()).toBe(false);
			expect(component.assistantProgress()).toBe(0);
		});

		it('stops processing when launch fails', () => {
			requestServiceMock.post$.mockReturnValue(throwError(() => new Error('offline')));

			(component as any)._launchAssistantProcessing('conv-1');

			expect(component.isAssistantProcessing()).toBe(false);
		});

		it('resumes polling when backend state is processing', () => {
			componentRef.setInput('assistantEnabled', true);
			requestServiceMock.getBasic$.mockReturnValue(of(assistantState('processing')));
			const beginPolling = vi.spyOn(component as any, '_beginAssistantPolling').mockImplementation(() => undefined);

			(component as any)._syncAssistantProcessingState('conv-1');

			expect(beginPolling).toHaveBeenCalledWith('conv-1');
		});

		it('launches a pending assistant turn when backend state is idle', () => {
			componentRef.setInput('assistantEnabled', true);
			vi.spyOn(component as any, '_hasPendingAssistantTurn').mockReturnValue(true);
			const launch = vi.spyOn(component as any, '_launchAssistantProcessing').mockImplementation(() => undefined);

			(component as any)._syncAssistantProcessingState('conv-1');

			expect(launch).toHaveBeenCalledWith('conv-1');
		});

		it('tracks polling progress and stops when processing completes', () => {
			vi.useFakeTimers();
			requestServiceMock.getBasic$.mockReturnValueOnce(of(assistantState('processing', 45))).mockReturnValueOnce(of(assistantState('done', 100)));
			const refresh = vi.spyOn(component.messagesPaginator, 'refresh');

			(component as any)._beginAssistantPolling('conv-1');
			vi.advanceTimersByTime(0);
			expect(component.assistantProgress()).toBe(45);
			vi.advanceTimersByTime(2000);

			expect(component.isAssistantProcessing()).toBe(false);
			expect(component.assistantProgress()).toBe(0);
			expect(refresh).toHaveBeenCalledOnce();
			vi.useRealTimers();
		});
	});
});
