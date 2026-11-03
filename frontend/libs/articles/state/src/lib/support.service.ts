import { Injectable, inject } from '@angular/core';
import { Article } from '@foundation/articles/models';
import { ConversationsRepository } from '@foundation/conversations/state';
import { formatUtcTimestamp, slugify } from '@foundation/utils';
import { Observable, catchError, map, of, switchMap } from 'rxjs';
import { v4 as uuidv4 } from 'uuid';

import { ArticlesRepository } from './articles.repository';

/**
 * Opening a ticket: one article of kind 'support' (or 'backlog') plus the conversation it is
 * really about. Three places used to build this by hand and had already drifted apart.
 */
@Injectable({ providedIn: 'root' })
export class SupportService {
	private _articlesRepository = inject(ArticlesRepository);
	private _conversationsRepository = inject(ConversationsRepository);

	/**
	 * Create a ticket and its conversation. Emits the article, or null if either step failed.
	 *
	 * Without a title the ticket names itself after the moment it was opened -- asking for one
	 * got whole problems typed into the title and no message written, which notified nobody.
	 * The first message renames it.
	 */
	createTicket$(kind: 'support' | 'backlog' = 'support', title?: string): Observable<Article | null> {
		const articleId = uuidv4();
		const articleTitle = title || `${kind === 'backlog' ? 'Feature request' : 'Support request'} — ${formatUtcTimestamp()}`;
		const article: Article = {
			id: articleId,
			kind,
			title: articleTitle,
			// The id keeps the slug unique: two tickets opened in the same minute share a title.
			slug: slugify(articleTitle) + '_' + articleId,
			featured: false,
			draft: kind === 'backlog',
			tags: [],
			config: {
				commentsEnabled: true,
			},
		};

		return this._articlesRepository.store.postObject$(article).pipe(
			switchMap((response) => {
				const created = response?.result?.data;
				if (!created) return of(null);
				// A backlog item is the public roadmap: anonymous readers get to see it.
				const prepared$ = kind === 'backlog' ? this._articlesRepository.store.toggleAnonymousReadForObject$(articleId).pipe(map(() => created)) : of(created);
				return prepared$.pipe(switchMap(() => this._conversationsRepository.createConversationFor$(articleId, 'article', 'default').pipe(map((conversation) => (conversation ? created : null)))));
			}),
			catchError(() => of(null))
		);
	}
}
