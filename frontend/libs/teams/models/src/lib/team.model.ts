import { Resource } from '@foundation/utils';

export interface Membership {
	userId: string;
	teamId: string;
	role: string;
}

/**
 * A pending invitation, as a team's config carries it. The stored record also holds the hash of
 * the token, which is deliberately not declared here: nothing in the app has any use for it.
 */
export interface TeamInvitation {
	id: string;
	email: string;
	role: string;
	invitedBy?: string;
	createdAt: string;
	expiresAt: string;
}

export interface TeamConfig {
	details?: string;
	invitations?: Record<string, TeamInvitation>;
}

export interface Team extends Resource {
	name?: string;
	config: TeamConfig;
	ownerId?: string;
}

/** What the join page gets back once a link has been spent. */
export interface ClaimedInvitation {
	teamId: string;
	teamName?: string;
	role: string;
}
