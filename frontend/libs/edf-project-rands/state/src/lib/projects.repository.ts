import { Injectable } from '@angular/core';
import { Params } from '@angular/router';
import { Project } from '@edf/edf-project-rands/models';
import { GenericRepository } from '@foundation/table/state';

@Injectable({ providedIn: 'root' })
export class ProjectsRepository extends GenericRepository<Project> {
	constructor() {
		super('projects', '/api/edf/rand/projects');
	}

	public goToProject(projectId: string | null, queryParams?: Params) {
		this._router.navigate(['/', 'host', 'dashboard', 'projects', projectId, 'builder'], {
			queryParams,
		});
	}
}
