import { TestBed } from '@angular/core/testing';
import { ChatDisplayerComponent } from './chat-displayer.component';
import { NotificationService } from '@foundation/notification';
import { ConversationsRepository } from '@foundation/conversations/state';
import { MessagesRepository } from '@foundation/messages/state';
import { UsersRepository } from '@foundation/users/state';
import { AccessService } from '@foundation/shared/access';
import { Router } from '@angular/router';
import { TranslationService } from '@foundation/translations/services';
import { of } from 'rxjs';
import { ComponentRef } from '@angular/core';

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

describe('ChatDisplayerComponent', () => {
	let component: ChatDisplayerComponent;
	let componentRef: ComponentRef<ChatDisplayerComponent>;

	beforeEach(() => {
		vi.clearAllMocks();
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
	});

	describe('hasMoreMessages', () => {
		it('returns boolean', () => {
			expect(typeof component.hasMoreMessages()).toBe('boolean');
		});
	});

	describe('showMoreMessages', () => {
		it('does not throw', () => {
			expect(() => component.showMoreMessages()).not.toThrow();
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
});
