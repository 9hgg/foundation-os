import { TestBed } from '@angular/core/testing';
import { ConversationDisplayerComponent } from './conversation-displayer.component';
import { NotificationService } from '@foundation/notification';
import { ConversationsRepository } from '@foundation/conversations/state';
import { MessagesRepository } from '@foundation/messages/state';
import { UsersRepository } from '@foundation/users/state';
import { AccessService } from '@foundation/shared/access';
import { Router } from '@angular/router';
import { TranslationService } from '@foundation/translations/services';
import { ArticlesRepository } from '@foundation/articles/state';
import { of } from 'rxjs';
import { ComponentRef, ElementRef } from '@angular/core';
import { Message } from '@foundation/messages/models';

vi.mock('uuid', () => ({ v4: () => 'mock-uuid' }));

const notificationMock = {
	snack: vi.fn(),
	snackSuccess: vi.fn(),
	snackError: vi.fn(),
	notify: vi.fn(),
	success: vi.fn(),
	error: vi.fn(),
	confirm: vi.fn().mockReturnValue({ closed: of(true) }),
	prompt: vi.fn().mockReturnValue({ closed: of(null) }),
};

const conversationsRepoMock = {
	store: {
		getObjectById$$$: vi.fn().mockReturnValue({ $: of(null) }),
		postObject$: vi.fn().mockReturnValue(of({ result: { data: { id: 'conv-1' } } })),
	},
	getConversationFor$: vi.fn().mockReturnValue(of(null)),
};

const messagesRepoMock = {
	store: {
		getObjects$: vi.fn().mockReturnValue(of({ data: [], totalCount: 0, page: 1, hasNext: false, hasPrev: false, self: '', all: '', next: '', prev: '' })),
		postObject$: vi.fn().mockReturnValue(of({ result: { data: { id: 'msg-1' } } })),
		patchObject$: vi.fn().mockReturnValue(of({ result: { data: {} } })),
		save: vi.fn().mockReturnValue(of({ result: { id: 'msg-1' } })),
		deleteObject$: vi.fn().mockReturnValue(of({})),
		upsertObjectLocally: vi.fn(),
	},
	toggleReaction$: vi.fn().mockReturnValue(of({ result: { message: { id: 'msg-1' } } })),
	convenientListOfExtraMessages: vi.fn().mockReturnValue({}),
	fetchMessagesDetails: vi.fn(),
};

const articlesRepoMock = {
	store: {
		getObjectByIdPullOnce$$$: vi.fn().mockReturnValue(of({ id: 'article-1', title: 'Original title', config: {} })),
		save: vi.fn().mockReturnValue(of({ result: { id: 'article-1' } })),
	},
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
	createUrlTree: vi.fn().mockReturnValue('/tree/article-1'),
	serializeUrl: vi.fn().mockReturnValue('/host/dashboard/articles/article-1/builder'),
	url: '/',
};

const translationMock = {
	prep: vi.fn().mockReturnValue(() => 'translated'),
	instant: vi.fn().mockReturnValue('translated'),
	translate$: vi.fn().mockReturnValue(of('translated')),
};

describe('ConversationDisplayerComponent', () => {
	let component: ConversationDisplayerComponent;
	let componentRef: ComponentRef<ConversationDisplayerComponent>;

	beforeEach(() => {
		vi.clearAllMocks();
		messagesRepoMock.store.save.mockReturnValue(of({ result: { id: 'msg-1' } }));
		messagesRepoMock.toggleReaction$.mockReturnValue(of({ result: { message: { id: 'msg-1' } } }));
		usersRepoMock.currentProfile.mockReturnValue({ id: 'user-1', email: 'test@test.com' });
		usersRepoMock.userIdsToDetails.mockReturnValue({});
		messagesRepoMock.convenientListOfExtraMessages.mockReturnValue({});
		articlesRepoMock.store.getObjectByIdPullOnce$$$.mockReturnValue(of({ id: 'article-1', title: 'Original title', config: {} }));
		articlesRepoMock.store.save.mockReturnValue(of({ result: { id: 'article-1' } }));
		TestBed.configureTestingModule({
			imports: [ConversationDisplayerComponent],
			providers: [
				{ provide: NotificationService, useValue: notificationMock },
				{ provide: ConversationsRepository, useValue: conversationsRepoMock },
				{ provide: MessagesRepository, useValue: messagesRepoMock },
				{ provide: UsersRepository, useValue: usersRepoMock },
				{ provide: ArticlesRepository, useValue: articlesRepoMock },
				{ provide: AccessService, useValue: accessServiceMock },
				{ provide: Router, useValue: routerMock },
				{ provide: TranslationService, useValue: translationMock },
			],
		});
		const fixture = TestBed.createComponent(ConversationDisplayerComponent);
		componentRef = fixture.componentRef;
		componentRef.setInput('resourceKind', 'article');
		componentRef.setInput('resourceId', 'res-1');
		component = fixture.componentInstance;
		fixture.detectChanges();
	});

	it('should be created', () => {
		expect(component).toBeTruthy();
	});

	it('should have default MAX_COMMENT_LENGTH of 4000', () => {
		expect(component.MAX_COMMENT_LENGTH).toBe(4000);
	});

	it('should have default COMMENT_LENGTH_COLLAPSE of 2000', () => {
		expect(component.COMMENT_LENGTH_COLLAPSE).toBe(2000);
	});

	it('should have 6 available reactions', () => {
		expect(component.availableReactions).toHaveLength(6);
	});

	it('should have default comment signals', () => {
		expect(component.commentLabelText()).toBe('Your comment');
		expect(component.commentPlaceholderText()).toBe('Write your comment here...');
		expect(component.commentButtonText()).toBe('Post comment');
	});

	it('should have null replyingToMessage by default', () => {
		expect(component.replyingToMessage()).toBeNull();
	});

	it('should have null activeReactionPickerMessageId by default', () => {
		expect(component.activeReactionPickerMessageId()).toBeNull();
	});

	describe('toggleReactionPicker', () => {
		it('sets message id when opening', () => {
			component.toggleReactionPicker('msg-1');
			expect(component.activeReactionPickerMessageId()).toBe('msg-1');
		});

		it('clears when toggling same message', () => {
			component.toggleReactionPicker('msg-1');
			component.toggleReactionPicker('msg-1');
			expect(component.activeReactionPickerMessageId()).toBeNull();
		});
	});

	describe('clearReplyTarget', () => {
		it('sets replyingToMessage to null', () => {
			component.clearReplyTarget();
			expect(component.replyingToMessage()).toBeNull();
		});
	});

	describe('scrollToTopComments', () => {
		it('attempts to scroll', () => {
			try {
				component.scrollToTopComments();
			} catch {
				// scrollIntoView unavailable in jsdom
			}
		});
	});

	describe('scrollToComment', () => {
		it('does not crash', () => {
			expect(() => component.scrollToComment()).not.toThrow();
		});
	});

	describe('processedMessages', () => {
		it('builds author labels, reactions, and reply previews', () => {
			const reply: Message = {
				id: 'reply-1',
				authorId: 'user-2',
				conversationId: 'conv-1',
				content: 'Earlier message',
				kind: 'default',
				config: { reactions: [] },
			};
			const message: Message = {
				id: 'msg-1',
				authorId: 'user-1',
				conversationId: 'conv-1',
				content: 'Hello',
				kind: 'default',
				config: {
					replyTo: 'reply-1',
					reactions: [
						{ userId: 'user-1', emoji: '👍' },
						{ userId: 'user-2', emoji: '👍' },
						{ userId: 'user-3', emoji: '❤️' },
					],
				},
			};
			usersRepoMock.userIdsToDetails.mockReturnValue({
				'user-1': { avatarUrl: '/avatar.png', publicName: 'Alice' },
				'user-2': { avatarUrl: null, publicName: 'Bob' },
			});
			messagesRepoMock.convenientListOfExtraMessages.mockReturnValue({ 'reply-1': reply });

			component.messagesPaginator.processPaginatedResponse({
				data: [message],
				totalCount: 1,
				page: 1,
				hasNext: false,
				hasPrev: false,
				self: '',
				all: '',
				next: '',
				prev: '',
			});

			const processedMessage = component.processedMessages()[0];
			expect(processedMessage).toEqual(
				expect.objectContaining({
					id: 'msg-1',
					authorPublicName: 'Alice',
					avatarUrl: '/avatar.png',
					currentUserReactionEmoji: '👍',
				})
			);
			expect(processedMessage?.reactionsSummary).toEqual([
				{ emoji: '👍', count: 2, userReacted: true },
				{ emoji: '❤️', count: 1, userReacted: false },
			]);
			expect(processedMessage?.replyTo?.authorPublicName).toBe('Bob');
		});

		it('gets a message by id from the current paginator page', () => {
			const message: Message = { id: 'msg-1', authorId: 'user-1', conversationId: 'conv-1', content: 'Hello', kind: 'default', config: {} };
			component.messagesPaginator.processPaginatedResponse({
				data: [message],
				totalCount: 1,
				page: 1,
				hasNext: false,
				hasPrev: false,
				self: '',
				all: '',
				next: '',
				prev: '',
			});

			expect(component.getMessageById('msg-1')).toEqual(message);
			expect(component.getMessageById('missing')).toBeUndefined();
		});
	});

	describe('postComment', () => {
		it('does not post empty comments', () => {
			component.newCommentContent.set('   ');

			component.postComment();

			expect(messagesRepoMock.store.save).not.toHaveBeenCalled();
		});

		it('notifies when there is no authenticated user', () => {
			component.conversation$$$.$$$.next({ id: 'conv-1', resourceId: 'res-1', resourceKind: 'article', conversationKey: 'default', config: {} });
			component.newCommentContent.set('Hello');
			usersRepoMock.currentProfile.mockReturnValue(null);

			component.postComment();

			expect(notificationMock.notify).toHaveBeenCalledWith('translated');
			expect(messagesRepoMock.store.save).not.toHaveBeenCalled();
		});

		it('saves a comment and clears the editor on success', () => {
			component.conversation$$$.$$$.next({ id: 'conv-1', resourceId: 'res-1', resourceKind: 'article', conversationKey: 'default', config: {} });
			component.newCommentContent.set('Hello');
			component.replyingToMessage.set({ id: 'reply-1' } as never);
			const goToPageSpy = vi.spyOn(component.messagesPaginator, 'goToPage').mockImplementation(() => {});

			component.postComment();

			expect(messagesRepoMock.store.save).toHaveBeenCalledWith(
				expect.objectContaining({
					id: 'mock-uuid',
					authorId: 'user-1',
					conversationId: 'conv-1',
					content: 'Hello',
					config: expect.objectContaining({ replyTo: 'reply-1' }),
				})
			);
			expect(component.newCommentContent()).toBe('');
			expect(component.replyingToMessage()).toBeNull();
			expect(goToPageSpy).toHaveBeenCalledWith(1);
		});

		it('shows an error when save returns no result', () => {
			component.conversation$$$.$$$.next({ id: 'conv-1', resourceId: 'res-1', resourceKind: 'article', conversationKey: 'default', config: {} });
			component.newCommentContent.set('Hello');
			messagesRepoMock.store.save.mockReturnValue(of({}));

			component.postComment();

			expect(notificationMock.error).toHaveBeenCalledWith('Failed to post comment.');
		});
	});

	it('removes a comment after confirmation', () => {
		const refreshSpy = vi.spyOn(component.messagesPaginator, 'refresh').mockReturnValue(of(undefined) as never);

		component.removeComment('msg-1');

		expect(notificationMock.confirm).toHaveBeenCalledWith('translated');
		expect(messagesRepoMock.store.deleteObject$).toHaveBeenCalledWith('msg-1');
		expect(refreshSpy).toHaveBeenCalled();
	});

	it('does not remove a comment when confirmation is rejected', () => {
		notificationMock.confirm.mockReturnValue({ closed: of(false) });

		component.removeComment('msg-1');

		expect(messagesRepoMock.store.deleteObject$).not.toHaveBeenCalled();
	});

	it('reports edit and report placeholders through notifications', () => {
		component.editComment('msg-1');
		component.reportComment('msg-2');

		expect(notificationMock.success).toHaveBeenCalledWith('Editing comment: msg-1 (not implemented)');
		expect(notificationMock.success).toHaveBeenCalledWith('Reporting comment: msg-2 (not implemented)');
	});

	it('sets and focuses a reply target', () => {
		vi.useFakeTimers();
		const focus = vi.fn();
		component.commentTextarea = new ElementRef({ focus });
		component.initiateReply({ id: 'msg-1' } as never);
		vi.advanceTimersByTime(1000);

		expect(component.replyingToMessage()).toEqual({ id: 'msg-1' });
		expect(focus).toHaveBeenCalled();
		vi.useRealTimers();
	});

	describe('setReaction', () => {
		it('notifies and closes the picker when no user is connected', () => {
			usersRepoMock.currentProfile.mockReturnValue(null);
			component.activeReactionPickerMessageId.set('msg-1');

			component.setReaction({ id: 'msg-1' } as never, '👍');

			expect(notificationMock.notify).toHaveBeenCalledWith('translated');
			expect(messagesRepoMock.toggleReaction$).not.toHaveBeenCalled();
			expect(component.activeReactionPickerMessageId()).toBeNull();
		});

		it('toggles a reaction and upserts the returned message', () => {
			component.activeReactionPickerMessageId.set('msg-1');

			component.setReaction({ id: 'msg-1' } as never, '👍');

			expect(messagesRepoMock.toggleReaction$).toHaveBeenCalledWith('msg-1', '👍');
			expect(messagesRepoMock.store.upsertObjectLocally).toHaveBeenCalledWith({ id: 'msg-1' });
			expect(component.activeReactionPickerMessageId()).toBeNull();
		});

		it('shows an error when reaction toggle returns no result', () => {
			messagesRepoMock.toggleReaction$.mockReturnValue(of({}));

			component.setReaction({ id: 'msg-1' } as never, '👍');

			expect(notificationMock.error).toHaveBeenCalledWith('Failed to set reaction.');
		});
	});

	describe('article admin actions', () => {
		it('opens the article builder when editing an article', () => {
			const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);

			component.editArticle();

			expect(routerMock.createUrlTree).toHaveBeenCalledWith(['/', 'host', 'dashboard', 'articles', 'res-1', 'builder']);
			expect(window.open).toHaveBeenCalledWith('/host/dashboard/articles/article-1/builder', '_blank');
			openSpy.mockRestore();
		});

		it('notifies when editing a non-article resource', () => {
			componentRef.setInput('resourceKind', 'team');

			component.editArticle();

			expect(notificationMock.notify).toHaveBeenCalledWith('Editing not supported for resource type: team');
		});

		it('adds a prefix to an article title', () => {
			component.addPrefixToTitle('[SOLVED]');

			expect(articlesRepoMock.store.getObjectByIdPullOnce$$$).toHaveBeenCalledWith('res-1');
			expect(articlesRepoMock.store.save).toHaveBeenCalledWith(expect.objectContaining({ title: '[SOLVED] Original title', slug: 'solved-original-title' }));
			expect(notificationMock.success).toHaveBeenCalledWith('translated');
		});

		it('does not add a duplicate prefix', () => {
			articlesRepoMock.store.getObjectByIdPullOnce$$$.mockReturnValue(of({ id: 'article-1', title: '[SOLVED] Original title', config: {} }));

			component.addPrefixToTitle('[SOLVED]');

			expect(notificationMock.notify).toHaveBeenCalledWith('translated');
			expect(articlesRepoMock.store.save).not.toHaveBeenCalled();
		});

		it('navigates to the admin user page', () => {
			component.goToAdminUserPage('user-1');

			expect(routerMock.navigate).toHaveBeenCalledWith(['/', 'admin', 'users', 'user-1', 'builder']);
		});
	});
});
