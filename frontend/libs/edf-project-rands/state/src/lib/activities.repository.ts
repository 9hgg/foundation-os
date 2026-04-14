import { Injectable } from '@angular/core';
import { Params } from '@angular/router';
import { Activity } from '@edf/edf-project-rands/models';
import { GenericRepository } from '@foundation/table/state';

@Injectable({ providedIn: 'root' })
export class ActivitiesRepository extends GenericRepository<Activity> {
	constructor() {
		super('activities', '/api/edf/rand/activities');
	}

	public goToActivity(activityId: string | null, queryParams?: Params) {
		this._router.navigate(['/', 'host', 'dashboard', 'activities', activityId, 'builder'], {
			queryParams,
		});
	}
}
