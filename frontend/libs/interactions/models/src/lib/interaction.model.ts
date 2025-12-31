import type { EntityFile } from '@foundation/files/models';
import { Resource } from '@foundation/utils';

export interface Interaction extends Resource {
	/**
	 * Identifier of the interview/object/anything that is being interacted with.
	 */
	key?: string;
	config: Record<string, any>;
}

export interface InteractionEvent {
	kind: string;
	payload: any;
}

export interface InteractionSchema {
	interactionEventBuffer: { isoTime: number; event: InteractionEvent }[];
	files: EntityFile[];
}

export interface InteractionBuffer {
	[interviewId: string]: InteractionSchema;
}
