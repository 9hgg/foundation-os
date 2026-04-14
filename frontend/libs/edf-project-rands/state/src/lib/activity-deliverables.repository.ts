import { Injectable } from '@angular/core';
import { ActivityDeliverable } from '@edf/edf-project-rands/models';
import { GenericRepository } from '@foundation/table/state';

@Injectable({ providedIn: 'root' })
export class ActivityDeliverablesRepository extends GenericRepository<ActivityDeliverable> {
	constructor() {
		super('activity-deliverables', '/api/edf/rand/activity-deliverables');
	}
}
