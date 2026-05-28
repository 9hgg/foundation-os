import { Message } from '@foundation/messages/models';
import { GenericRepository } from '@foundation/table/state';
import { Injectable, signal } from '@angular/core';
import { BehaviorSubject, debounceTime, map, tap } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class MessagesRepository extends GenericRepository<Message> {
	convenientListOfExtraMessages = signal<{
		[messageId: string]: Message;
	}>({});

	constructor() {
		super('message');

		// fetch message details
		this._messagesDetailsToFetch
			.pipe(
				debounceTime(100),
				tap((messageIds) => {
					this._fetchMessagesDetails(messageIds);
				})
			)
			.subscribe();
	}

	public toggleReaction$(messageId: string, reaction: string) {
		return this._requestService.post$<{ message: Message }, string>(`/api/messages/${messageId}/reaction/toggle`, reaction).pipe(
			tap((response) => {
				console.log('Toggle reaction response:', response);
			})
		);
	}

	public deleteAsAdmin$(messageId: string) {
		return this._requestService.deleteObject$<Message>(`/api/messages/admin/${messageId}`);
	}

	// debounce the function to avoid too many requests
	private _messagesDetailsToFetch = new BehaviorSubject<string[]>([]);
	public fetchMessagesDetails(messageIds: string[]) {
		this._messagesDetailsToFetch.next(messageIds);
	}
	private _fetchMessagesDetails(messageIds: string[]) {
		for (const messageId of messageIds) {
			if (this.convenientListOfExtraMessages()[messageId]) {
				continue;
			}
			this.store
				.getObjectById$$$(messageId, true)
				.pipe(
					tap((message) => {
						if (message) {
							this.convenientListOfExtraMessages.set({
								...this.convenientListOfExtraMessages(),
								[messageId]: message,
							});
						}
					})
				)
				.subscribe();
		}
	}
}
