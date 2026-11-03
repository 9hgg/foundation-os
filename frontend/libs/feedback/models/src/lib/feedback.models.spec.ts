import {
	FEEDBACK_INTERACTION_PREFIX,
	FeedbackBlockResponse,
	isFeedbackResponse,
	isMCQFeedbackResponse,
	isNPSFeedbackResponse,
	isRatingFeedbackResponse,
	isSupportTicketFeedbackResponse,
	isTextareaFeedbackResponse,
	isTextFeedbackResponse,
} from './feedback.models';

describe('feedback models', () => {
	it('uses a stable interaction key prefix', () => {
		expect(FEEDBACK_INTERACTION_PREFIX).toBe('feedback');
	});

	it('recognizes complete feedback responses', () => {
		expect(isFeedbackResponse({ blocks: [], timestamp: 123 })).toBe(true);
		expect(isFeedbackResponse({ blocks: [], timestamp: '123' })).toBe(false);
		expect(isFeedbackResponse({ timestamp: 123 })).toBe(false);
		expect(isFeedbackResponse(null)).toBe(false);
	});

	it.each([
		['mcq', isMCQFeedbackResponse],
		['text', isTextFeedbackResponse],
		['textarea', isTextareaFeedbackResponse],
		['rating', isRatingFeedbackResponse],
		['nps', isNPSFeedbackResponse],
		['support-ticket', isSupportTicketFeedbackResponse],
	] as const)('narrows %s block responses', (kind, guard) => {
		const matching = { kind } as FeedbackBlockResponse;
		const different = { kind: kind === 'text' ? 'rating' : 'text' } as FeedbackBlockResponse;

		expect(guard(matching as never)).toBe(true);
		expect(guard(different as never)).toBe(false);
	});
});
