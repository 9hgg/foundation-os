import { Injectable } from '@angular/core';
import { AnnualContribution } from '@edf/edf-project-rands/models';
import { GenericRepository } from '@foundation/table/state';

@Injectable({ providedIn: 'root' })
export class AnnualContributionsRepository extends GenericRepository<AnnualContribution> {
	constructor() {
		super('annual-contributions', '/api/edf/rand/annual-contributions');
	}
}
