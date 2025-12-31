import { Resource } from '@foundation/utils';

export interface Membership {
	userId: string;
	teamId: string;
	role: string;
}

export interface TeamConfig {
	details?: string;
}

export interface Team extends Resource {
	name?: string;
	config: TeamConfig;
	ownerId?: string;
}
