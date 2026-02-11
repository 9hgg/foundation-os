import { Resource } from '@foundation/utils';

interface NotificationBase extends Resource {
	targetId?: string;
	targetKind?: string; // e.g., "article", "comment", "reaction", etc.
	title?: string; // e.g., "My First Notification"
	read: boolean;
	archived?: boolean;
	content?: string;
	kind: string; // e.g., "default", "agent", "reaction", etc.
	config: Record<string, any>; // Configuration specific to the notification kind
}

// REACTION
interface NotificationReactionConfig {
	conversationId: string;
	messageId: string;
	userId: string;
	emoji: string;
}
interface NotificationReaction extends NotificationBase {
	targetId: string;
	kind: 'reaction';
	config: NotificationReactionConfig;
}

// COMMENT
interface NotificationCommentConfig {
	conversationId: string;
	messageId: string;
	userId: string;
}
interface NotificationComment extends NotificationBase {
	targetId: string;
	kind: 'comment';
	config: NotificationCommentConfig;
}

// REPLY
interface NotificationReplyConfig {
	conversationId: string;
	messageId: string;
	userId: string;
	replyToId: string;
}
interface NotificationReply extends NotificationBase {
	targetId: string;
	kind: 'reply';
	config: NotificationReplyConfig;
}
// MENTION
interface NotificationMentionConfig {
	conversationId: string;
	messageId: string;
	userId: string;
	mentionId: string;
}
interface NotificationMention extends NotificationBase {
	targetId: string;
	kind: 'mention';
	config: NotificationMentionConfig;
}
// INTERACTION
interface NotificationInteractionInterviewConfig {
	interactionDetails: {
		nbTotalSteps: number;
		nbStepsSeen: number;
		nbBlocksWithInteraction: number;
		nbBlocksTotal: number;
		lastInteraction: {
			stepId: string;
			blockId: string;
			propertyId: string;
		};
	};
}
interface NotificationInteraction extends NotificationBase {
	targetId: string;
	kind: 'interaction.interview';
	config: NotificationInteractionInterviewConfig;
}

// FORM INTERACTION
interface NotificationInteractionFormConfig {
	// Placeholder structure matching interview for now, or simplified
	interactionDetails?: {
		nbTotalSteps: number;
		nbStepsSeen: number;
	};
}
interface NotificationInteractionForm extends NotificationBase {
	targetId: string;
	kind: 'interaction.form';
	config: NotificationInteractionFormConfig;
}

export type Notification = NotificationReaction | NotificationComment | NotificationReply | NotificationMention | NotificationInteraction | NotificationInteractionForm;
