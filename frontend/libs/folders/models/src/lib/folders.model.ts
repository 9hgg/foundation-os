import { Resource } from '@foundation/utils';

export interface Folder extends Resource {
	name?: string;
	parentId?: string;

	/** UUID of the resource this folder was made for
	 *
	 * This is only for root folders
	 */
	forId?: string;
	/** Type of the resource this folder was made for */
	forKind?: string;
}
