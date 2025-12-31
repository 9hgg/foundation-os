import { Conversation } from '@foundation/conversations/models';
import { ConversationsRepository } from '@foundation/conversations/state';
import { Message } from '@foundation/messages/models';
import { MessagesRepository } from '@foundation/messages/state';
import { Filter, PaginatorState } from '@foundation/network/store';
import { NotificationService } from '@foundation/notification';
import { TranslationService } from '@foundation/translations/services';
import { TranslateDirective, TranslatePipe } from '@foundation/translations/services';
import { UsersRepository } from '@foundation/users/state';
import { UserPillComponent } from '@foundation/users/ui';
import { BehaviorSubjectReplayedProxied, DateAsAgoPipe, NewlinesToBrPipe, Selector } from '@foundation/utils';
import { CdkMenuModule } from '@angular/cdk/menu';
import { CommonModule } from '@angular/common';
import { Component, ElementRef, ViewChild, computed, effect, inject, input, model, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { of, tap } from 'rxjs';
import { v4 as uuidv4 } from 'uuid';
const DEFAULT_NUMBER_OF_MESSAGES = 10;

// Interface for processed message data
interface ProcessedMessage extends Message {
	authorId: string;
	authorPublicName: string;
	avatarUrl: string;
	currentUserReactionEmoji?: string;
	reactionsSummary: { emoji: string; count: number; userReacted: boolean }[];
	replyTo?: ProcessedMessage;
}

@Component({
	selector: 'lib-conversation-displayer',
	standalone: true,
	imports: [CommonModule, FormsModule, CdkMenuModule, TranslateDirective, TranslatePipe, DateAsAgoPipe, NewlinesToBrPipe, UserPillComponent],
	templateUrl: './conversation-displayer.component.html',
	styleUrls: ['./conversation-displayer.component.css'],
})
export class ConversationDisplayerComponent {
	private _notificationService = inject(NotificationService);
	private _conversationsRepository = inject(ConversationsRepository);
	private _messagesRepository = inject(MessagesRepository);
	usersRepository = inject(UsersRepository);
	private _translationService = inject(TranslationService);
	public MAX_COMMENT_LENGTH = 2000;
	public COMMENT_LENGTH_COLLAPSE = 200;
	public commentTitle = input<string | undefined>('Comments');
	public displayNoCommentsMessage = signal(true);

	// todo: add i18n
	public commentLabelText = signal('Your comment');
	public commentPlaceholderText = signal('Write your comment here...');
	public commentButtonText = signal('Post comment');

	@ViewChild('commentTextarea') commentTextarea: ElementRef<HTMLTextAreaElement> | undefined;
	@ViewChild('commentsContainer') commentsContainer: ElementRef<HTMLDivElement> | undefined;

	conversationKey = model<string>('default');
	resourceKind = model.required<string>();
	resourceId = model.required<string>();

	replyingToMessage = signal<ProcessedMessage | null>(null);
	expandedComments = new Selector<Message>((a, b) => a.id === b.id, []);
	newCommentContent = model<string>('');

	public availableReactions: string[] = ['👍', '❤️', '😂', '🤔', '😢', '🙏'];

	public messagesPaginator: PaginatorState<Message> = new PaginatorState<Message>({
		pageSize: DEFAULT_NUMBER_OF_MESSAGES,
		orderingBy: {
			direction: 'desc',
			fieldName: 'timeCreated',
		},
	});

	public activeReactionPickerMessageId = signal<string | null>(null);

	conversation$$$ = new BehaviorSubjectReplayedProxied<string | null, Conversation | null>((id: string | null) => {
		return id ? this._conversationsRepository.store.getObjectById$$$(id).$ : of(null);
	}, null);

	// Convert the paginator state to a signal for computed dependencies
	private _messagePaginatorState = toSignal(this.messagesPaginator.state$);

	// todo : move to users repository

	// Computed signal that processes messages for display
	processedMessages = computed(() => {
		const _messagePaginatorState = this._messagePaginatorState();
		const userIdsToDetails = this.usersRepository.userIdsToDetails();
		const convenientListOfExtraMessages = this._messagesRepository.convenientListOfExtraMessages();
		if (!_messagePaginatorState) return [];
		const currentUserId = this.usersRepository.currentProfile()?.id;
		// if (!currentUserId) return [];
		return _messagePaginatorState.itemsOnCurrentPage.map((message) => (message ? this._convertMessageToProcessedMessage(message, userIdsToDetails, currentUserId, convenientListOfExtraMessages) : null));
	});

	// private _realtimeService = inject(RealtimeService);

	constructor() {
		// find conversation by resourceId, resourceKind and conversationKey
		effect(() => {
			const conversationKey = this.conversationKey();
			const resourceKind = this.resourceKind();
			const resourceId = this.resourceId();
			if (conversationKey && resourceKind && resourceId) {
				this._conversationsRepository
					.getConversationFor$(resourceId, resourceKind, conversationKey)
					.pipe(
						tap((conversation) => {
							if (conversation) {
								console.log('[conversation]Conversation found:', conversation);
								this.conversation$$$.next(conversation.id);
								this.messagesPaginator.setRequestFn((page, pageSize, filters, orderingBy, forceRequest) => {
									const extraFilterOnConversationId: Filter = {
										fieldName: 'conversation_id',
										value: conversation.id,
									};
									filters.push(extraFilterOnConversationId);

									return this._messagesRepository.store.getObjects$(page, pageSize, filters, orderingBy, forceRequest, false);
								});

								// // Initial fetch of messages
								// this.messagesPaginator.requestPage$().subscribe();
							}
						})
					)
					.subscribe();
			} else {
				// clear the conversation if not found
				this.conversation$$$.next(null);
				this.messagesPaginator.setRequestFn((page, pageSize, filters, orderingBy, forceRequest) => {
					return of({
						data: [],
						totalCount: 0,
						page: 1,
						hasNext: false,
						hasPrev: false,
						self: '',
						all: '',
						next: '',
						prev: '',
					});
				});
			}
		});

		// reacts to messagesPaginator state changes to fetch user details and update the convenient list of extra messages
		effect(() => {
			const state = this._messagePaginatorState();
			const convenientListOfExtraMessages = this._messagesRepository.convenientListOfExtraMessages();
			if (state) {
				const neededUserIds = new Set<string>();
				const neededMessageIds = new Set<string>();

				const messagesOnCurrentPage = state.itemsOnCurrentPage;
				for (const currentMessage of messagesOnCurrentPage) {
					if (currentMessage) {
						// Add the author of the current message
						neededUserIds.add(currentMessage.authorId);

						if (currentMessage.config?.replyTo) {
							// Add the replyTo message itself to the neededMessageIds
							neededMessageIds.add(currentMessage.config.replyTo);

							// if the replyTo message is already in the convenient list, add its authorId to neededUserIds
							const replyToMessage = convenientListOfExtraMessages[currentMessage.config.replyTo];
							if (replyToMessage) neededUserIds.add(replyToMessage.authorId);
						}

						// add the reactions authors to neededUserIds
						if (currentMessage.config?.reactions) {
							for (const reaction of currentMessage.config.reactions) {
								neededUserIds.add(reaction.userId);
							}
						}
					}
				}
				this.usersRepository.fetchUsersDetails(Array.from(neededUserIds));
				this._messagesRepository.fetchMessagesDetails(Array.from(neededMessageIds));
			}
		});

		// this._realtimeService.getMessagesByType('notification').subscribe((message) => {
		// 	console.log('Received notification message:', message);
		// 	this.messagesPaginator.refresh();
		// });
	}

	private _convertMessageToProcessedMessage(
		//
		message: Message,
		userIdsToDetails: {
			[userId: string]:
				| {
						avatarUrl: string | null;
						publicName: string | null;
				  }
				| undefined;
		} = {},
		currentUserId?: string,
		convenientListOfExtraMessages: { [messageId: string]: Message } = {}
	): ProcessedMessage {
		const userId = message.authorId;
		const userDetails = userIdsToDetails[userId];
		const avatarUrl = userDetails?.avatarUrl || '';
		const publicName = userDetails?.publicName || 'User';
		const currentUserReactionEmoji = message.config?.reactions?.find((reaction) => reaction.userId === currentUserId)?.emoji;
		const reactionsSummary: { emoji: string; count: number; userReacted: boolean }[] = [];
		const reactions = message.config?.reactions || [];
		const replyTo = message.config?.replyTo ? convenientListOfExtraMessages[message.config.replyTo] : undefined;
		const reactionCounts: { [emoji: string]: number } = {};

		for (const reaction of reactions) {
			if (reactionCounts[reaction.emoji]) {
				reactionCounts[reaction.emoji]++;
			} else {
				reactionCounts[reaction.emoji] = 1;
			}
		}
		for (const [emoji, count] of Object.entries(reactionCounts)) {
			reactionsSummary.push({
				emoji,
				count,
				userReacted: reactions.some((reaction) => reaction.userId === currentUserId && reaction.emoji === emoji),
			});
		}
		const processedMessage: ProcessedMessage = {
			...message,
			authorId: userId,
			avatarUrl,
			authorPublicName: publicName,
			currentUserReactionEmoji,
			reactionsSummary,
			replyTo: replyTo ? this._convertMessageToProcessedMessage(replyTo, userIdsToDetails, currentUserId, convenientListOfExtraMessages) : undefined,
		};
		return processedMessage;
	}

	public getMessageById(id: string): Message | undefined {
		const state = this._messagePaginatorState();
		if (!state) return undefined;
		return state.itemsOnCurrentPage.find((m) => m?.id === id);
	}

	private _i18n_youMustBeConnected = this._translationService.prep('You must be connected to perform this action.');
	public postComment() {
		if (!this.newCommentContent().trim()) {
			console.warn('Comment cannot be empty.');
			return;
		}
		if (this.newCommentContent.length > this.MAX_COMMENT_LENGTH) {
			console.warn(`Comment cannot exceed ${this.MAX_COMMENT_LENGTH} characters.`);
			return;
		}

		// conversation id
		const conversationId = this.conversation$$$.value?.id;
		if (!conversationId) {
			console.error('Conversation ID is not available.');
			return;
		}

		// user id
		const currentUserId = this.usersRepository.currentProfile()?.id;
		if (!currentUserId) {
			this._notificationService.notify(this._i18n_youMustBeConnected());
			return;
		}

		const messageId = uuidv4();
		const replyingToMessageId = this.replyingToMessage()?.id;
		const commentContent = this.newCommentContent();

		const newMessage: Message = {
			id: messageId,
			authorId: currentUserId,
			conversationId: conversationId,
			content: commentContent,
			kind: 'default',
			config: {
				reactions: [],
				replyTo: replyingToMessageId,
			},
		};

		console.log('Posting comment:', newMessage);

		this._messagesRepository.store
			.save(newMessage)
			.pipe(
				tap((response) => {
					if (response.result) {
						this.newCommentContent.set('');
						this.clearReplyTarget();
						console.log('Going to first page after posting comment.');
						this.messagesPaginator.goToPage(1);

						setTimeout(() => {
							// scroll "immediately" to the new comment if available
							const commentElement = document.getElementById(`message-${messageId}`);
							if (commentElement) commentElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
							else {
								setTimeout(() => {
									const commentElement = document.getElementById(`message-${messageId}`);
									commentElement?.scrollIntoView({ behavior: 'smooth', block: 'center' });
								}, 1000);
							}
						}, 100);
						// Scroll to the new comment
					} else {
						this._notificationService.error('Failed to post comment.');
					}
				})
			)
			.subscribe();
	}

	public scrollToTopComments(): void {
		document.getElementById('top-anchor')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
	}

	public scrollToComment(): void {
		document.getElementById('commentArea')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
		// Focus the textarea after scrolling
		setTimeout(() => {
			document.getElementById('commentArea')?.focus();
		}, 300);
	}

	public editComment(messageId: string): void {
		console.log('Editing comment:', messageId);
		this._notificationService.success(`Editing comment: ${messageId} (not implemented)`);
	}

	public removeComment(messageId: string): void {
		this._messagesRepository.store
			.deleteObject$(messageId)
			.pipe(
				tap(() => {
					this.messagesPaginator.refresh();
				})
			)
			.subscribe();
	}

	public reportComment(messageId: string): void {
		console.log('Reporting comment:', messageId);
		this._notificationService.success(`Reporting comment: ${messageId} (not implemented)`);
	}

	public initiateReply(message: ProcessedMessage): void {
		this.replyingToMessage.set(message);
		document.getElementById('bottom-anchor')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
		setTimeout(() => {
			// this.commentTextarea?.nativeElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
			this.commentTextarea?.nativeElement.focus();
		}, 1000);
	}

	public clearReplyTarget(): void {
		this.replyingToMessage.set(null);
	}

	public setReaction(message: Message, emoji: string): void {
		console.log(`Setting reaction ${emoji} for message ${message.id}`);

		const currentUserId = this.usersRepository.currentProfile()?.id;
		if (!currentUserId) {
			this._notificationService.notify(this._i18n_youMustBeConnected());
			this.activeReactionPickerMessageId.set(null); // Close picker if user is not connected
			return;
		}

		this._messagesRepository
			.toggleReaction$(message.id, emoji)
			.pipe(
				tap((response) => {
					if (response.result) {
						console.log('Successfully set reaction:', response.result);
						this._messagesRepository.store.upsertObjectLocally(response.result.message);
					} else {
						this._notificationService.error('Failed to set reaction.');
					}
				})
			)
			.subscribe();
		this.activeReactionPickerMessageId.set(null); // Close picker after selection
	}

	public toggleReactionPicker(messageId: string): void {
		if (this.activeReactionPickerMessageId() === messageId) {
			this.activeReactionPickerMessageId.set(null);
		} else {
			this.activeReactionPickerMessageId.set(messageId);
		}
	}
}
