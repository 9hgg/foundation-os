import { Injectable } from '@angular/core';
import { Batch } from '@edf/edf-project-rands/models';
import { GenericRepository } from '@foundation/table/state';

@Injectable({ providedIn: 'root' })
export class BatchesRepository extends GenericRepository<Batch> {
	constructor() {
		super('batches', '/api/edf/rand/batches');
	}

	public goToBatch(batchId: string | null) {
		this._router.navigate(['/', 'host', 'dashboard', 'batches', batchId, 'builder']);
	}
}
