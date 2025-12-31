import { ConversationsRepository } from '@foundation/conversations/state';
import { MessagesRepository } from '@foundation/messages/state';
import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';

@Component({
	selector: 'lib-conversations-test-page',
	imports: [CommonModule],
	templateUrl: './conversations-test-page.component.html',
	styleUrl: './conversations-test-page.component.css',
})
export class ConversationsTestPageComponent {
	private _conversationRepository = inject(ConversationsRepository);
	private _messagesRepository = inject(MessagesRepository);
}
