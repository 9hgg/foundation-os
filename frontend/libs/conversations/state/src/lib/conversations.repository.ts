import { Conversation } from '@foundation/conversations/models';
import { GenericRepository } from '@foundation/table/state';
import { Injectable } from '@angular/core';
import { map, of, switchMap } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class ConversationsRepository extends GenericRepository<Conversation> {
	constructor() {
		super('conversation');
	}

	/**
	 * Create a conversation for a specific resource.
	 * This is useful for creating a conversation for a specific resource, such as an article or backlog item.
	 * Idempotent operation: if the conversation already exists, it will be returned without creating a new one.
	 * @param resource_id : unique identifier for the resource (e.g.: article ID)
	 * @param resource_kind : kind of resource (e.g.: "article", "backlog")
	 * @param key : unique key for the conversation (e.g.: "article-\<UUID>-default", "default", "for-user-\<UUID>")
	 * @returns
	 */
	createConversationFor$(resource_id: string, resource_kind: string, key: string) {
		return this._requestService.post$<{ key: string; created: boolean; conversation: Conversation }>(`/api/conversations/for/${resource_kind}/${resource_id}/${key}`, {}).pipe(
			map((response) => {
				if (response.result) {
					this.store.upsertObjectLocally(response.result.conversation);
					console.log('Conversation created or retrieved:', response.result);
					return response.result.conversation.id;
				}
				return null;
			}),
			switchMap((conversationId) => {
				if (!conversationId) {
					console.error('No conversation ID returned');
					return of(null);
				}
				return this.store.getObjectById$$$(conversationId).$;
			})
		);
	}

	getConversationFor$(resource_id: string, resource_kind: string, key: string) {
		return this._requestService.getBasic$<{ conversation: Conversation | null }>(`/api/conversations/for/${resource_kind}/${resource_id}/${key}`).pipe(
			map((response) => {
				if (response.result && response.result.conversation) {
					this.store.upsertObjectLocally(response.result.conversation);
					console.log('Conversation retrieved:', response.result);
					return response.result.conversation.id;
				}
				return null;
			}),
			switchMap((conversationId) => {
				if (!conversationId) {
					return of(null);
				}
				return this.store.getObjectById$$$(conversationId).$;
			})
		);
	}
}
