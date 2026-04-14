/* eslint-disable @angular-eslint/prefer-inject */
import { CdkMenuModule } from '@angular/cdk/menu';
import { CommonModule } from '@angular/common';
import { Attribute, ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { Project } from '@edf/edf-project-rands/models';
import { ProjectsRepository } from '@edf/edf-project-rands/state';
import { AccessService } from '@foundation/shared/access';
import { BehaviorType, RepositoryTableComponent } from '@foundation/table/ui';
import { TranslateDirective, TranslatePipe } from '@foundation/translations/services';
import { switchMap } from 'rxjs';

@Component({
	selector: 'lib-projects-table',
	standalone: true,
	imports: [
		//
		CommonModule,
		ReactiveFormsModule,
		FormsModule,
		TranslateDirective,
		TranslatePipe,
		CdkMenuModule,
	],
	templateUrl: './projects-table.component.html',
	styleUrl: './projects-table.component.css',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProjectTableComponent extends RepositoryTableComponent<Project, ProjectsRepository> {
	private _accessService = inject(AccessService);

	constructor(
		private _repository: ProjectsRepository,
		@Attribute('click-behavior') clickBehavior: BehaviorType
	) {
		super(
			_repository,
			{
				orderingBy: { fieldName: 'timeCreated', direction: 'desc' },
				alwaysOnFilters: [],
			},
			clickBehavior
		);
	}

	private _i18n_renameSentence = this._translationService.prep('Give a new name to this project:');
	public renameProjects(project: Project) {
		this._notificationService
			.prompt(this._i18n_renameSentence(), undefined, {
				defaultValue: project.name ?? '',
			})
			.closed.subscribe((promptResult) => {
				if (!promptResult || !promptResult.value) return;
				console.log('You want to rename this project:', project, 'to', promptResult.value);

				this._repository.store
					.putObject$({ ...project, name: promptResult.value })
					.pipe(switchMap(() => this.paginator.refresh()))
					.subscribe();
			});
	}

	private _i18n_deleteSentence = this._translationService.prep('Are you sure you want to delete this project?');
	public deleteProjects(project: Project) {
		this._notificationService.confirm(this._i18n_deleteSentence()).closed.subscribe((confirmed) => {
			if (!confirmed) return;
			console.log('You want to delete this:', project);
			this._repository.store
				.deleteObject$(project.id)
				.pipe(switchMap(() => this.paginator.refresh()))
				.subscribe();
		});
	}

	public goToProjects(projectId: string | null) {
		this._repository.goToProject(projectId);
	}

	public shareWithTeam(project: Project) {
		this._accessService.shareWithTeam(project.id, 'edf_project_rand');
	}

	public openSharingDetails(project: Project) {
		this._accessService.openSharingDetails(project.id, 'edf_project_rand');
	}
}
