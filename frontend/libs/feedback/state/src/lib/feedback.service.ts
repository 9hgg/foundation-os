import { inject, Injectable } from '@angular/core';
import { Interaction } from '@foundation/interactions/models';
import { InteractionsRepository } from '@foundation/interactions/state';
import { RequestService } from '@foundation/network/services';
import { SupportService } from '@foundation/articles/state';
import { FeedbackBlockResponse, FEEDBACK_INTERACTION_PREFIX } from '@foundation/feedback/models';
import { map, Observable, of, switchMap } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class FeedbackService {
	interactionsRepository = inject(InteractionsRepository);
	private _requestService = inject(RequestService);
	private _supportService = inject(SupportService);

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
	 * Create a support ticket from a feedback answer. Emits true on success.
	 *
	 * The ticket itself is SupportService's job -- this only keeps the boolean shape the widget
	 * expects, since a feedback block cares whether it worked, not which article resulted.
	 */
	createSupportTicketFromFeedback$(title: string): Observable<boolean> {
		return this._supportService.createTicket$('support', title).pipe(map((article) => !!article));
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
