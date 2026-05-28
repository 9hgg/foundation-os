import { inject, Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { Article } from '@foundation/articles/models';
import { ArticlesRepository } from '@foundation/articles/state';
import { Conversation } from '@foundation/conversations/models';
import { ConversationsRepository } from '@foundation/conversations/state';
import { Message } from '@foundation/messages/models';
import { MessagesRepository } from '@foundation/messages/state';
import { RequestService } from '@foundation/network/services';
import { NotificationService } from '@foundation/notification';
import { TranslationService } from '@foundation/translations/services';
import { UsersRepository } from '@foundation/users/state';
import { slugify } from '@foundation/utils';
import { catchError, map, Observable, of, switchMap, take, tap } from 'rxjs';
import { v4 as uuidv4 } from 'uuid';

interface AssistantConversationCreationSuccess {
	status: 'created';
	article: Article;
	conversation: Conversation;
	message: Message;
}

interface AssistantConversationCreationCancelled {
	status: 'cancelled';
}

interface AssistantConversationCreationFailed {
	status: 'failed';
}

type AssistantConversationCreationResult = AssistantConversationCreationSuccess | AssistantConversationCreationCancelled | AssistantConversationCreationFailed;

@Injectable({ providedIn: 'root' })
export class McpAssistantConversationService {
	private _translationService = inject(TranslationService);
	private _notificationService = inject(NotificationService);
	private _router = inject(Router);
	private _requestService = inject(RequestService);
	private _articlesRepository = inject(ArticlesRepository);
	private _conversationsRepository = inject(ConversationsRepository);
	private _messagesRepository = inject(MessagesRepository);
	private _usersRepository = inject(UsersRepository);

	private _i18n_createNewArticleSentence = this._translationService.prep('How can I help you?');
	private _i18n_errorOccurredWhileCreatingAssistant = this._translationService.prep('An error occurred while creating the assistant. Please try again.');

	createNewArticle(firstMessage?: string): void {
		this._resolveFirstMessage$(firstMessage)
			.pipe(
				switchMap((resolvedFirstMessage) => {
					if (!resolvedFirstMessage) {
						return of(this._cancelledResult());
					}

					return this._createConversationFlow$(resolvedFirstMessage);
				}),
				tap((result) => {
					if (result.status === 'created') {
						this._router.navigateByUrl('/host/dashboard/assistant/' + result.article.id);
						this._requestService.post$('/api/assistants/process/' + result.conversation.id, {}).pipe(take(1)).subscribe();
						return;
					}

					if (result.status === 'failed') {
						this._notificationService.error(this._i18n_errorOccurredWhileCreatingAssistant(), undefined, { width: '300px' });
					}
				})
			)
			.subscribe();
	}

	private _resolveFirstMessage$(firstMessage?: string): Observable<string | null> {
		const preparedFirstMessage = firstMessage?.trim();
		if (preparedFirstMessage) {
			return of(preparedFirstMessage);
		}

		return this._notificationService.promptTextarea(undefined, this._i18n_createNewArticleSentence(), { width: '300px' }).closed.pipe(
			map((promptResult) => {
				if (!promptResult) {
					return null;
				}

				const promptedFirstMessage = promptResult.value?.trim();
				if (!promptedFirstMessage) {
					return null;
				}

				return promptedFirstMessage;
			})
		);
	}

	private _createConversationFlow$(firstMessage: string): Observable<AssistantConversationCreationResult> {
		const articleId = uuidv4();
		const title = new Date().toLocaleString();
		const article: Article = {
			id: articleId,
			kind: 'assistant',
			title,
			slug: slugify(title),
			featured: false,
			draft: false,
			tags: [],
			config: {
				commentsEnabled: true,
			},
		};

		return this._articlesRepository.store.postObject$(article).pipe(
			switchMap((articleResponse) => {
				const createdArticle = articleResponse.result?.data;
				if (!createdArticle) {
					return of(this._failedResult());
				}

				return this._conversationsRepository.createConversationFor$(articleId, 'article', 'default').pipe(
					switchMap((conversation) => {
						const currentUserId = this._usersRepository.currentProfile()?.id;
						if (!conversation || !currentUserId) {
							return of(this._failedResult());
						}

						const messageId = uuidv4();
						const newMessage: Message = {
							id: messageId,
							authorId: currentUserId,
							conversationId: conversation.id,
							content: firstMessage,
							kind: 'default',
							config: {},
						};

						return this._messagesRepository.store.save(newMessage).pipe(
							map((messageResponse) => {
								const createdMessage = messageResponse.result?.data;
								if (!createdMessage) {
									return this._failedResult();
								}

								return this._createdResult(createdArticle, conversation, createdMessage);
							})
						);
					})
				);
			}),
			catchError(() => of(this._failedResult()))
		);
	}

	private _createdResult(article: Article, conversation: Conversation, message: Message): AssistantConversationCreationSuccess {
		return {
			status: 'created',
			article,
			conversation,
			message,
		};
	}

	private _cancelledResult(): AssistantConversationCreationCancelled {
		return { status: 'cancelled' };
	}

	private _failedResult(): AssistantConversationCreationFailed {
		return { status: 'failed' };
	}
}