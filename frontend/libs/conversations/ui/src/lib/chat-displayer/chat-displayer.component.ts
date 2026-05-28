import { CdkMenuModule } from '@angular/cdk/menu';
import { CommonModule } from '@angular/common';
import { Component, DestroyRef, computed, effect, inject, input, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { RequestService } from '@foundation/network/services';
import { TranslateDirective } from '@foundation/translations/services';
import { DateAsAgoPipe, MarkdownToHtmlDirective, NewlinesToBrPipe } from '@foundation/utils';
import { Subscription, switchMap, take, timer } from 'rxjs';
import { ConversationDisplayerComponent } from '../conversation-displayer/conversation-displayer.component';

interface AssistantState {
	conversationId: string;
	taskId: string | null;
	status: string; // 'idle' | 'processing' | 'done' | 'failed' | 'stalled'
	messageId: string | null;
	error: string | null;
	progress: number; // 0–100
}

/** Delay (ms) after posting a message before triggering assistant processing,
 *  to allow the message to be persisted on the backend first. */
const ASSISTANT_TRIGGER_DELAY_MS = 800;

/** Polling interval (ms) when checking whether the assistant has finished. */
const ASSISTANT_STATE_POLL_INTERVAL_MS = 2000;
const CHAT_SCROLL_DELAY_MS = 120;

@Component({
	selector: 'lib-chat-displayer',
	standalone: true,
	imports: [
		//
		CommonModule,
		FormsModule,
		CdkMenuModule,
		TranslateDirective,
		DateAsAgoPipe,
		NewlinesToBrPipe,
		MarkdownToHtmlDirective,
	],
	templateUrl: './chat-displayer.component.html',
	styleUrls: ['./chat-displayer.component.css'],
})
export class ChatDisplayerComponent extends ConversationDisplayerComponent {
	private _requestService = inject(RequestService);
	private _destroyRef = inject(DestroyRef);

	// Signal to prevent double submission
	isSubmittingMessage = signal(false);

	/** When true, posting a message will automatically trigger the assistant to process the conversation. */
	assistantEnabled = input(false);

	/** True while the assistant is generating a reply. */
	isAssistantProcessing = signal(false);

	/** Progress percentage (0–100) reported by the backend task. */
	assistantProgress = signal(0);

	private _assistantBootstrapKey = signal<string | null>(null);
	private _assistantPollingSubscription: Subscription | null = null;
	private _conversationSignal = toSignal(this.conversation$$$.$, { initialValue: null });
	private _chatPaginatorState = toSignal(this.messagesPaginator.state$, { initialValue: null });
	private _lastScrollSyncKey = signal<string | null>(null);
	private _shouldStickToBottom = signal(false);

	// Helper method to determine if a message is from the current user
	isFromCurrentUser = computed(() => {
		const currentUserId = this.usersRepository.currentProfile()?.id;
		return (messageAuthorId: string|undefined) => currentUserId === messageAuthorId;
	});

	constructor() {
		super();
		// this.messagesPaginator.setOrderingBy('timeCreated', 'asc');

		// Update text for chat-oriented interface
		this.commentLabelText.set('Your message');
		this.commentPlaceholderText.set('Type your message...');
		this.commentButtonText.set('Send');

		effect(() => {
			this._setupAssistantBootstrapSync();
		});

		effect(() => {
			const state = this._chatPaginatorState();
			const items = state?.itemsOnCurrentPage ?? [];
			const syncKey = `${items.map((message) => message?.id ?? 'null').join('|')}:${this.isAssistantProcessing()}`;
			if (this._lastScrollSyncKey() === syncKey) {
				return;
			}
			this._lastScrollSyncKey.set(syncKey);

			if (!this._shouldStickToBottom() || items.length === 0) {
				return;
			}
			this._scheduleScrollToLatest();
		});
	}

	// Handle Enter key press for message sending
	onEnterKeyDown(event: KeyboardEvent): void {
		if (!event.shiftKey && event.key === 'Enter') {
			event.preventDefault();

			// Prevent double submission - same checks as postComment
			if (this.isSubmittingMessage()) {
				return;
			}

			// Check if there's actually content to send
			const content = this.newCommentContent()?.trim();
			if (!content) {
				return;
			}

			this.postComment();
		}
	}

	// Show more messages by increasing page size
	showMoreMessages(): void {
		this._shouldStickToBottom.set(false);
		const currentPageSize = this.messagesPaginator.numberOfItemsPerPage$$$.value;
		const newPageSize = currentPageSize + 10; // Increase by 10 messages each time
		this.messagesPaginator.setPageSize(newPageSize);
	}

	// Check if there are more messages to show
	hasMoreMessages(): boolean {
		const totalItems = this.messagesPaginator.totalNumberOfItems$$$.value;
		const pageSize = this.messagesPaginator.numberOfItemsPerPage$$$.value;
		return totalItems > pageSize;
	}

	// Override postComment to auto-scroll to bottom in chat mode and prevent double submission
	override postComment(): void {
		// Prevent double submission
		if (this.isSubmittingMessage()) {
			return;
		}

		// Check if there's actually content to send
		const content = this.newCommentContent()?.trim();
		if (!content) {
			return;
		}

		// Set submitting state
		this.isSubmittingMessage.set(true);

		// Call parent postComment method
		super.postComment();

		// Trigger assistant processing after posting (if enabled)
		if (this.assistantEnabled()) {
			// Slight delay to allow the message to be saved first
			setTimeout(() => {
				const conversationId = this.conversation$$$.value?.id;
				if (conversationId) {
					this._launchAssistantProcessing(conversationId);
				}
			}, ASSISTANT_TRIGGER_DELAY_MS);
		}

		// Reset submitting state after a short delay.
		setTimeout(() => {
			this.isSubmittingMessage.set(false);
		}, 500);
	}

	private _setupAssistantBootstrapSync(): void {
		const conversation = this._conversationSignal();
		const paginatorState = this._chatPaginatorState();
		const conversationId = conversation?.id;
		const messageCount = paginatorState?.itemsOnCurrentPage?.length ?? 0;

		if (!this.assistantEnabled() || !conversationId || messageCount === 0) {
			return;
		}

		const bootstrapKey = `${conversationId}:${messageCount}:${this._hasPendingAssistantTurn()}`;
		if (this._assistantBootstrapKey() === bootstrapKey) {
			return;
		}

		this._assistantBootstrapKey.set(bootstrapKey);
		queueMicrotask(() => {
			this._syncAssistantProcessingState(conversationId);
		});
	}

	private _syncAssistantProcessingState(conversationId: string): void {
		if (!this.assistantEnabled()) {
			return;
		}

		this._requestService
			.getBasic$<AssistantState>(`/api/assistants/process/${conversationId}/state`)
			.pipe(take(1), takeUntilDestroyed(this._destroyRef))
			.subscribe((response) => {
				const status = response.result?.status;
				if (status === 'processing') {
					this._beginAssistantPolling(conversationId);
					return;
				}

				if (this._hasPendingAssistantTurn()) {
					this._launchAssistantProcessing(conversationId);
				} else {
					this._stopAssistantPolling();
				}
			});
	}

	private _launchAssistantProcessing(conversationId: string): void {
		this._shouldStickToBottom.set(true);
		this.isAssistantProcessing.set(true);
		this._requestService
			.post$<AssistantState>(`/api/assistants/process/${conversationId}`, {})
			.pipe(take(1), takeUntilDestroyed(this._destroyRef))
			.subscribe({
				next: (response) => {
					const status = response.result?.status;
					if (status === 'done') {
						this._stopAssistantPolling();
						this.messagesPaginator.refresh();
						return;
					}
					if (status === 'failed' || status === 'stalled') {
						this._stopAssistantPolling();
						return;
					}
					this._beginAssistantPolling(conversationId);
				},
				error: () => {
					this._stopAssistantPolling();
				},
			});
	}

	private _beginAssistantPolling(conversationId: string): void {
		this._assistantPollingSubscription?.unsubscribe();
		this._shouldStickToBottom.set(true);
		this.isAssistantProcessing.set(true);
		this._assistantPollingSubscription = timer(0, ASSISTANT_STATE_POLL_INTERVAL_MS)
			.pipe(
				switchMap(() => this._requestService.getBasic$<AssistantState>(`/api/assistants/process/${conversationId}/state`)),
				takeUntilDestroyed(this._destroyRef)
			)
			.subscribe({
				next: (response) => {
					const status = response.result?.status;
					const progress = response.result?.progress ?? 0;
					if (status === 'done') {
						this._stopAssistantPolling();
						this.messagesPaginator.refresh();
					} else if (status === 'failed' || status === 'stalled' || status === 'idle') {
						this._stopAssistantPolling();
					} else {
						this.isAssistantProcessing.set(true);
						this.assistantProgress.set(progress);
					}
				},
				error: () => {
					this._stopAssistantPolling();
				},
			});
	}

	private _stopAssistantPolling(): void {
		this._assistantPollingSubscription?.unsubscribe();
		this._assistantPollingSubscription = null;
		this.isAssistantProcessing.set(false);
		this.assistantProgress.set(0);
	}

	protected override _scrollAfterCommentPosted(messageId: string): void {
		void messageId;
		this._shouldStickToBottom.set(true);
		this._scheduleScrollToLatest();
	}

	private _scheduleScrollToLatest(): void {
		setTimeout(() => {
			document.getElementById('bottom-anchor')?.scrollIntoView({ behavior: 'smooth', block: 'end' });
		}, CHAT_SCROLL_DELAY_MS);
	}

	private _hasPendingAssistantTurn(): boolean {
		const messages = this._chatPaginatorState()?.itemsOnCurrentPage ?? [];
		const latestVisibleTurn = messages.find((message) => message && message.kind !== 'assistant-thinking');
		if (!latestVisibleTurn) {
			return false;
		}
		return latestVisibleTurn.kind !== 'assistant-response' && latestVisibleTurn.kind !== 'agent';
	}
}
