import { Injectable } from '@angular/core';
import { AnnualFacilityUsage } from '@edf/edf-project-rands/models';
import { GenericRepository } from '@foundation/table/state';

@Injectable({ providedIn: 'root' })
export class AnnualFacilityUsagesRepository extends GenericRepository<AnnualFacilityUsage> {
	constructor() {
		super('annual-facility-usages', '/api/edf/rand/annual-facility-usages');
	}
}
