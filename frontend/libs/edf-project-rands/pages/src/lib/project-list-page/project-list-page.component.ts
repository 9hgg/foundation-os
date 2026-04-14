import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ProjectCreateModalResult, ProjectsModals } from '@edf/edf-project-rands/modals';
import { Project } from '@edf/edf-project-rands/models';
import { ProjectsRepository } from '@edf/edf-project-rands/state';
import { ProjectTableComponent } from '@edf/edf-project-rands/ui';
import { TranslateDirective } from '@foundation/translations/services';
import { of, switchMap, tap } from 'rxjs';
import { v4 as uuidv4 } from 'uuid';

@Component({
	selector: 'lib-project-list-page',
	standalone: true,
	imports: [TranslateDirective, ProjectTableComponent],
	templateUrl: './project-list-page.component.html',
	styleUrl: './project-list-page.component.css',
	changeDetection: ChangeDetectionStrategy.OnPush,
	host: {
		class: 'dashboard-page-host',
	},
})
export class ProjectListPageComponent {
	private _projectsModals = inject(ProjectsModals);
	public projectsRepository = inject(ProjectsRepository);

	createNew() {
		return this._projectsModals
			.openProjectCreateDialog()
			.closed.pipe(
				switchMap((result: ProjectCreateModalResult | undefined) => {
					if (!result) return of(null);
					const id = uuidv4();

					const payload: Project = {
						id: id,
						name: result.name,
						code: result.code,
						description: result.description,
						startDate: result.startDate,
						endDate: result.endDate,
						config: result.config,
					};

					return this.projectsRepository.store.postObject$(payload);
				}),
				tap((c) => {
					const newId = c?.result?.data?.id;
					if (newId) this.projectsRepository.goToProject(newId);
				})
			)
			.subscribe();
	}
}
