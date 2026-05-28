import type { Conversation, ConversationConfig } from './conversation.model';

describe('conversation.model', () => {
	it('accepts the full conversation resource shape used by conversation features', () => {
		const conversation = {
			id: 'conversation-1',
			key: 'article-1-default',
			status: 'active',
			title: 'Article discussion',
			config: {
				availableReactions: ['like', 'love'],
				displayReactions: true,
				richText: true,
			},
		} satisfies Conversation;

		expect(conversation.key).toBe('article-1-default');
		expect(conversation.status).toBe('active');
		expect(conversation.config.availableReactions).toEqual(['like', 'love']);
	});

	it('supports every conversation status currently modeled', () => {
		const statuses: Conversation['status'][] = ['active', 'hidden', 'disabled', 'archived'];

		expect(statuses).toEqual(['active', 'hidden', 'disabled', 'archived']);
	});

	it('allows a minimal config and optional reaction/rich-text settings', () => {
		const minimal = {} satisfies ConversationConfig;
		const configured = {
			availableReactions: ['thumbs-up'],
			displayReactions: false,
			richText: false,
		} satisfies ConversationConfig;

		expect(minimal).toEqual({});
		expect(configured.displayReactions).toBe(false);
	});
});
