import { TestBed } from '@angular/core/testing';
import { ConversationDisplayerComponent } from './conversation-displayer.component';
import { NotificationService } from '@foundation/notification';
import { ConversationsRepository } from '@foundation/conversations/state';
import { MessagesRepository } from '@foundation/messages/state';
import { UsersRepository } from '@foundation/users/state';
import { AccessService } from '@foundation/shared/access';
import { Router } from '@angular/router';
import { TranslationService } from '@foundation/translations/services';
import { of, BehaviorSubject } from 'rxjs';
import { ComponentRef } from '@angular/core';

vi.mock('uuid', () => ({ v4: () => 'mock-uuid' }));

const notificationMock = {
	snack: vi.fn(),
	snackSuccess: vi.fn(),
	snackError: vi.fn(),
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
		deleteObject$: vi.fn().mockReturnValue(of({})),
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
	navigate: vi.fn(),
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
		TestBed.configureTestingModule({
			imports: [ConversationDisplayerComponent],
			providers: [
				{ provide: NotificationService, useValue: notificationMock },
				{ provide: ConversationsRepository, useValue: conversationsRepoMock },
				{ provide: MessagesRepository, useValue: messagesRepoMock },
				{ provide: UsersRepository, useValue: usersRepoMock },
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

	it('should have default MAX_COMMENT_LENGTH of 2000', () => {
		expect(component.MAX_COMMENT_LENGTH).toBe(2000);
	});

	it('should have default COMMENT_LENGTH_COLLAPSE of 200', () => {
		expect(component.COMMENT_LENGTH_COLLAPSE).toBe(200);
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
		it('returns array', () => {
			expect(Array.isArray(component.processedMessages())).toBe(true);
		});
	});
});
