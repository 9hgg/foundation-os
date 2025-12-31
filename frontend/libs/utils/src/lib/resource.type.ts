export interface Resource {
	/** Id of the resource */
	id: string;
	/** Time of creation of the resource (ISO string) */
	timeCreated?: string;
	/** Time of last update of the resource (ISO string) */
	timeUpdated?: string;
}
