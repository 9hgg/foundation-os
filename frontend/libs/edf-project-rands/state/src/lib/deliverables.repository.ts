import { Injectable } from '@angular/core';
import { Deliverable } from '@edf/edf-project-rands/models';
import { GenericRepository } from '@foundation/table/state';

@Injectable({ providedIn: 'root' })
export class DeliverablesRepository extends GenericRepository<Deliverable> {
	constructor() {
		super('deliverables', '/api/edf/rand/deliverables');
	}

	public goToDeliverable(deliverableId: string | null) {
		this._router.navigate(['/', 'host', 'dashboard', 'deliverables', deliverableId, 'builder']);
	}
}
