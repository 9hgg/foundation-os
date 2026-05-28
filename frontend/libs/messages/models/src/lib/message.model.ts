import { Resource } from '@foundation/utils';

export interface MessageConfig {
	// Configuration specific to the message kind
	replyTo?: string; // ID of the message being replied to
	reactions?: Array<{ userId: string; emoji: string }>; // For storing emoji reactions
}

export interface Message extends Resource {
	conversationId: string; // UUID
	authorId?: string; // UUID of the user who sent the message
	title?: string; // e.g., "My First Message"
	content?: string;
	kind: string; // e.g., "default", "agent", "reaction", etc.
	config: MessageConfig;
}
