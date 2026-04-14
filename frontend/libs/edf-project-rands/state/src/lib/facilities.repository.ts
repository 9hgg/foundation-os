import { Injectable } from '@angular/core';
import { Facility } from '@edf/edf-project-rands/models';
import { GenericRepository } from '@foundation/table/state';

@Injectable({ providedIn: 'root' })
export class FacilitiesRepository extends GenericRepository<Facility> {
	constructor() {
		super('edf-project-rand/facilities', '/api/edf/rand/facilities');
	}

	public goToFacility(facilityId: string | null) {
		this._router.navigate(['/', 'host', 'dashboard', 'facilities', facilityId, 'builder']);
	}
}
