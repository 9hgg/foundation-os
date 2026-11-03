import { TestBed } from '@angular/core/testing';
import { ArticlesRepository } from '@foundation/articles/state';
import { ConversationsRepository } from '@foundation/conversations/state';
import { InteractionsRepository } from '@foundation/interactions/state';
import { RequestService } from '@foundation/network/services';
import { firstValueFrom, of, throwError } from 'rxjs';
import { FeedbackService } from './feedback.service';

vi.mock('uuid', () => ({ v4: () => 'feedback-id' }));

describe('FeedbackService', () => {
	const interaction = { id: 'interaction-1', config: {} as Record<string, unknown> };
	const interactions = {
		getOrCreateInteraction$: vi.fn(),
		saveInteractionByToken$: vi.fn(),
	};
	const requests = { getBasic$: vi.fn() };
	const articles = { store: { postObject$: vi.fn() } };
	const conversations = { createConversationFor$: vi.fn() };
	let service: FeedbackService;

	beforeEach(() => {
		vi.clearAllMocks();
		interaction.config = {};
		interactions.getOrCreateInteraction$.mockReturnValue(of(interaction));
		interactions.saveInteractionByToken$.mockReturnValue(of(interaction));
		TestBed.configureTestingModule({
			providers: [
				FeedbackService,
				{ provide: InteractionsRepository, useValue: interactions },
				{ provide: RequestService, useValue: requests },
				{ provide: ArticlesRepository, useValue: articles },
				{ provide: ConversationsRepository, useValue: conversations },
			],
		});
		service = TestBed.inject(FeedbackService);
	});

	it('builds and resolves namespaced interactions', async () => {
		expect(service.buildInteractionKey('homepage')).toBe('feedback.homepage');
		expect(await firstValueFrom(service.getOrCreateInteraction$('homepage'))).toBe(interaction);
		expect(interactions.getOrCreateInteraction$).toHaveBeenCalledWith('feedback.homepage');
	});

	it('reads persisted widget state and answers', () => {
		const saved = {
			config: {
				submitted: true,
				hidden: true,
				dismissed: true,
				answers: { 0: { kind: 'text', text: 'hello' } },
			},
		} as never;

		expect(service.isSubmittedFromInteraction(saved)).toBe(true);
		expect(service.isHiddenFromInteraction(saved)).toBe(true);
		expect(service.isDismissedFromInteraction(saved)).toBe(true);
		expect(service.getAnswersFromInteraction(saved)).toEqual({ 0: { kind: 'text', text: 'hello' } });
		expect(service.getAnswersFromInteraction({ config: {} } as never)).toEqual({});
	});

	it('merges and saves a block answer', () => {
		interaction.config['answers'] = { 0: { kind: 'rating', value: 4 } };
		service.saveAnswer('homepage', 1, { kind: 'text', text: 'Useful' });

		expect(interaction.config['answers']).toEqual({
			0: { kind: 'rating', value: 4 },
			1: { kind: 'text', text: 'Useful' },
		});
		expect(interactions.saveInteractionByToken$).toHaveBeenCalledWith(interaction);
	});

	it('persists submitted, hidden, dismissed, and cleared-answer state', () => {
		service.markSubmitted('homepage');
		expect(interaction.config['submitted']).toBe(true);
		service.saveHiddenState('homepage');
		expect(interaction.config['hidden']).toBe(true);
		service.saveDismissedState('homepage');
		expect(interaction.config['dismissed']).toBe(true);
		service.clearAnswers('homepage');
		expect(interaction.config['answers']).toEqual({});
		expect(interactions.saveInteractionByToken$).toHaveBeenCalledTimes(4);
	});

	it('does not save when interaction creation yields no interaction', () => {
		interactions.getOrCreateInteraction$.mockReturnValue(of(null));
		service.saveAnswer('missing', 0, { kind: 'text', text: 'ignored' });
		service.markSubmitted('missing');
		expect(interactions.saveInteractionByToken$).not.toHaveBeenCalled();
	});

	it('creates an article and conversation for support feedback', async () => {
		articles.store.postObject$.mockReturnValue(of({ result: { data: { id: 'feedback-id' } } }));
		conversations.createConversationFor$.mockReturnValue(of({ id: 'conversation-1' }));

		await expect(firstValueFrom(service.createSupportTicketFromFeedback$('Need help!'))).resolves.toBe(true);
		expect(articles.store.postObject$).toHaveBeenCalledWith({
			id: 'feedback-id',
			kind: 'support',
			title: 'Need help!',
			slug: 'need-help_feedback-id',
			featured: false,
			draft: false,
			tags: [],
			config: { commentsEnabled: true },
		});
		expect(conversations.createConversationFor$).toHaveBeenCalledWith('feedback-id', 'article', 'default');
	});

	it('returns false when support article creation is rejected or fails', async () => {
		articles.store.postObject$.mockReturnValueOnce(of({ result: null }));
		await expect(firstValueFrom(service.createSupportTicketFromFeedback$('No article'))).resolves.toBe(false);

		articles.store.postObject$.mockReturnValueOnce(throwError(() => new Error('offline')));
		await expect(firstValueFrom(service.createSupportTicketFromFeedback$('Offline'))).resolves.toBe(false);
		expect(conversations.createConversationFor$).not.toHaveBeenCalled();
	});

	it('lists all feedback and a single slug through the admin endpoints', async () => {
		requests.getBasic$
			.mockReturnValueOnce(of({ result: [interaction] }))
			.mockReturnValueOnce(of({ result: [interaction] }))
			.mockReturnValueOnce(of({}));

		await expect(firstValueFrom(service.listFeedbackInteractions$())).resolves.toEqual([interaction]);
		await expect(firstValueFrom(service.listInteractionsBySlug$('homepage'))).resolves.toEqual([interaction]);
		await expect(firstValueFrom(service.listFeedbackInteractions$())).resolves.toEqual([]);
		expect(requests.getBasic$).toHaveBeenNthCalledWith(1, '/api/interactions/by-key-prefix/feedback.');
		expect(requests.getBasic$).toHaveBeenNthCalledWith(2, '/api/interactions/by-key/feedback.homepage');
	});
});
