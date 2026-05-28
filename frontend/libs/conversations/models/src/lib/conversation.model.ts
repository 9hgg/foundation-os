import { Resource } from '@foundation/utils';

export interface Conversation extends Resource {
	/** key can be used to have multiple conversations on the same resource.
	 * This can be useful for having different conversation threads for the same article, support ticket, etc.
	 * For example :
	 * - "default" for the main conversation thread related to a resource (e.g., an article or support ticket).
	 * - "admin" for internal discussions among administrators or support staff that should not be visible to end-users.
	 * - "ai" for comments made by ai tools for specific resources, allowing us to separate human and AI interactions while still associating them with the same underlying resource.
	 */
	key: string; // unique and indexed (e.g., "article-<UUID>-default", "default")
	/**
	 * This can be used to categorize conversations into different types.
	 * - active: The conversation is currently active and can be interacted with.
	 * - hidden: The conversation is not visible to the user but still exists in the system.
	 * - disabled: The conversation is disabled and cannot be interacted with but is visible.
	 * - archived: The conversation is archived and can be restored later.
	 */
	status: 'active' | 'hidden' | 'disabled' | 'archived'; // e.g., "draft", "published", "archived"
	title?: string;
	config: ConversationConfig;
}

export interface ConversationConfig {
	availableReactions?: string[]; // e.g., ["👍", "👎", "❤️"]
	displayReactions?: boolean; // Whether to display reactions
	richText?: boolean; // Whether to allow rich text formatting
}
