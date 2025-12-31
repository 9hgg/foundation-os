import { TranslationsRepository } from '@foundation/translations/state';
import { TranslationService } from '@foundation/translations/services';
import { TranslationTableComponent } from '@foundation/translations/ui';
import { TranslatePipe, TranslateDirective } from '@foundation/translations/services';
import { DateAsAgoPipe, NewlinesToBrPipe } from '@foundation/utils';
import { CdkMenuModule } from '@angular/cdk/menu';
import { CommonModule } from '@angular/common';
import { Component, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ConversationDisplayerComponent } from '../conversation-displayer/conversation-displayer.component';

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
	],
	templateUrl: './chat-displayer.component.html',
	styleUrls: ['./chat-displayer.component.css'],
})
export class ChatDisplayerComponent extends ConversationDisplayerComponent {
	// Signal to prevent double submission
	isSubmittingMessage = signal(false);

	// Helper method to determine if a message is from the current user
	isFromCurrentUser = computed(() => {
		const currentUserId = this.usersRepository.currentProfile()?.id;
		return (messageAuthorId: string) => currentUserId === messageAuthorId;
	});

	constructor() {
		super();
		// this.messagesPaginator.setOrderingBy('timeCreated', 'asc');

		// Update text for chat-oriented interface
		this.commentLabelText.set('Your message');
		this.commentPlaceholderText.set('Type your message...');
		this.commentButtonText.set('Send');
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

		// Reset submitting state after a short delay
		// We use a timeout to ensure the message has been processed
		setTimeout(() => {
			this.isSubmittingMessage.set(false);
			// Auto-scroll to bottom after posting in chat interface
			document.getElementById('bottom-anchor')?.scrollIntoView({ behavior: 'smooth', block: 'end' });
		}, 500);
	}
}
