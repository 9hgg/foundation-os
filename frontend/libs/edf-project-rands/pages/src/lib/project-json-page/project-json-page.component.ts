import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, effect, inject, model } from '@angular/core';
import { BehaviorSubjectReplayedProxied } from '@foundation/utils';
import { Project } from '@edf/edf-project-rands/models';
import { ProjectsRepository } from '@edf/edf-project-rands/state';
import { of } from 'rxjs';
import { RouterLink } from "@angular/router";

@Component({
	selector: 'lib-project-json-page',
	standalone: true,
	imports: [
    //
    CommonModule,
    RouterLink
],
	templateUrl: './project-json-page.component.html',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProjectJsonPageComponent {
	private _projectsRepository = inject(ProjectsRepository);

	public projectId = model<string | null>(null);

	project$$$ = new BehaviorSubjectReplayedProxied<string | null, Project | null>((id: string | null) => {
		return id ? this._projectsRepository.store.getObjectById$$$(id,true).$ : of(null);
	}, null);

	constructor() {
		effect(() => {
			const projectId = this.projectId();
			this.project$$$.next(projectId);
		});
	}
}
