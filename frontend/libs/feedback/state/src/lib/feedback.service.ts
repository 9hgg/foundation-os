import { inject, Injectable } from '@angular/core';
import { Interaction } from '@foundation/interactions/models';
import { InteractionsRepository } from '@foundation/interactions/state';
import { RequestService } from '@foundation/network/services';
import { Article } from '@foundation/articles/models';
import { ArticlesRepository } from '@foundation/articles/state';
import { ConversationsRepository } from '@foundation/conversations/state';
import { slugify } from '@foundation/utils';
import { FeedbackBlockResponse, FEEDBACK_INTERACTION_PREFIX } from '@foundation/feedback/models';
import { catchError, map, Observable, of, switchMap } from 'rxjs';
import { v4 as uuidv4 } from 'uuid';

@Injectable({ providedIn: 'root' })
export class FeedbackService {
	interactionsRepository = inject(InteractionsRepository);
	private _requestService = inject(RequestService);
	private _articlesRepository = inject(ArticlesRepository);
	private _conversationsRepository = inject(ConversationsRepository);

	buildInteractionKey(slug: string): string {
		return `${FEEDBACK_INTERACTION_PREFIX}.${slug}`;
	}

	getOrCreateInteraction$(slug: string): Observable<Interaction> {
		return this.interactionsRepository.getOrCreateInteraction$(this.buildInteractionKey(slug));
	}

	// ─── Readers ─────────────────────────────────────────────────────────────

	isSubmittedFromInteraction(interaction: Interaction): boolean {
		return interaction.config['submitted'] === true;
	}

	isHiddenFromInteraction(interaction: Interaction): boolean {
		return interaction.config['hidden'] === true;
	}

	isDismissedFromInteraction(interaction: Interaction): boolean {
		return interaction.config['dismissed'] === true;
	}

	/** Returns saved per-block answers keyed by block index, or empty object. */
	getAnswersFromInteraction(interaction: Interaction): Record<number, FeedbackBlockResponse> {
		return (interaction.config['answers'] as Record<number, FeedbackBlockResponse>) ?? {};
	}

	// ─── Writers ─────────────────────────────────────────────────────────────

	/** Persist a single block's answer immediately. */
	saveAnswer(slug: string, blockIndex: number, blockResponse: FeedbackBlockResponse): void {
		const interactionKey = this.buildInteractionKey(slug);
		this.interactionsRepository
			.getOrCreateInteraction$(interactionKey)
			.pipe(
				switchMap((interaction) => {
					if (!interaction) return of(null);
					const answers = { ...(interaction.config['answers'] as Record<number, FeedbackBlockResponse> ?? {}) };
					answers[blockIndex] = blockResponse;
					interaction.config['answers'] = answers;
					return this.interactionsRepository.saveInteractionByToken$(interaction) ?? of(null);
				})
			)
			.subscribe();
	}

	/** Mark the widget as explicitly submitted (answers must already be saved). */
	markSubmitted(slug: string): void {
		this._saveConfigFlag(slug, 'submitted', true);
	}

	saveHiddenState(slug: string): void {
		this._saveConfigFlag(slug, 'hidden', true);
	}

	saveDismissedState(slug: string): void {
		this._saveConfigFlag(slug, 'dismissed', true);
	}

	/** Clear all stored block answers for this widget (used when `repeat: true`). */
	clearAnswers(slug: string): void {
		this._saveConfigFlag(slug, 'answers', {});
	}

	/**
	 * Create a support ticket (Article of kind 'support' + default Conversation).
	 * Returns an observable that emits `true` on success or `false` on failure.
	 */
	createSupportTicketFromFeedback$(title: string): Observable<boolean> {
		const articleId = uuidv4();
		const slugBase = slugify(title) || 'support-ticket';
		const article: Article = {
			id: articleId,
			kind: 'support',
			title,
			slug: slugBase + '_' + articleId,
			featured: false,
			draft: false,
			tags: [],
			config: {
				commentsEnabled: true,
			},
		};

		return this._articlesRepository.store.postObject$(article).pipe(
			switchMap((r) => {
				if (!r?.result?.data) return of(false);
				return this._conversationsRepository.createConversationFor$(articleId, 'article', 'default').pipe(
					map(() => true),
				);
			}),
			catchError(() => of(false)),
		);
	}

	private _saveConfigFlag(slug: string, key: string, value: unknown): void {
		const interactionKey = this.buildInteractionKey(slug);
		this.interactionsRepository
			.getOrCreateInteraction$(interactionKey)
			.pipe(
				switchMap((interaction) => {
					if (!interaction) return of(null);
					interaction.config[key] = value;
					return this.interactionsRepository.saveInteractionByToken$(interaction) ?? of(null);
				})
			)
			.subscribe();
	}

	// ─── Admin ────────────────────────────────────────────────────────────────

	listFeedbackInteractions$(): Observable<Interaction[]> {
		return this._requestService
			.getBasic$<Interaction[]>(`/api/interactions/by-key-prefix/${FEEDBACK_INTERACTION_PREFIX}.`)
			.pipe(map((response) => response.result ?? []));
	}

	listInteractionsBySlug$(slug: string): Observable<Interaction[]> {
		const key = this.buildInteractionKey(slug);
		return this._requestService
			.getBasic$<Interaction[]>(`/api/interactions/by-key/${key}`)
			.pipe(map((response) => response.result ?? []));
	}
}
