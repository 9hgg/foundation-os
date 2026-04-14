import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, effect, inject, model, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { ProjectsModals } from '@edf/edf-project-rands/modals';
import { Batch, Project } from '@edf/edf-project-rands/models';
import { BatchesRepository, ProjectsRepository } from '@edf/edf-project-rands/state';
import { NotificationService } from '@foundation/notification';
import { QuillTextareaComponent } from '@foundation/quill/ui';
import { TranslateDirective } from '@foundation/translations/services';
import { BehaviorSubjectReplayedProxied } from '@foundation/utils';
import { of, switchMap, tap } from 'rxjs';

@Component({
	selector: 'lib-batch-builder-page',
	standalone: true,
	imports: [CommonModule, FormsModule, TranslateDirective, RouterModule, QuillTextareaComponent],
	templateUrl: './batch-builder-page.component.html',
	styleUrls: ['./batch-builder-page.component.css'],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BatchBuilderPageComponent {
	public notificationService = inject(NotificationService);
	private _batchesRepository = inject(BatchesRepository);
	private _projectsRepository = inject(ProjectsRepository);
	private _projectsModals = inject(ProjectsModals);

	public batchId = model<string | null>(null);

	batch$$$ = new BehaviorSubjectReplayedProxied<string | null, Batch | null>((id: string | null) => {
		return id ? this._batchesRepository.store.getObjectByIdPullOnce$$$(id).$ : of(null);
	}, null);

	selectedProject = signal<Project | null>(null);

	constructor() {
		const _route = inject(ActivatedRoute);
		_route.paramMap.subscribe((pm) => this.batchId.set(pm.get('batchId')));

		effect(() => {
			const id = this.batchId();
			this.batch$$$.next(id);
		});

		this.batch$$$
			.pipe(
				takeUntilDestroyed(),
				switchMap((batch) => {
					if (!batch || !batch.projectId) {
						this.selectedProject.set(null);
						return of(null);
					}
					return this._projectsRepository.store.getObjectByIdPullOnce$$$(batch.projectId).$;
				}),
				tap((project) => {
					this.selectedProject.set(project);
				})
			)
			.subscribe();
	}

	updateTitle(title: string) {
		const b = this.batch$$$.value;
		if (!b) return;
		b.title = title;
		this._batchesRepository.store.save(b);
	}

	updatePrefix(prefix: string) {
		const b = this.batch$$$.value;
		if (!b) return;
		b.prefix = prefix;
		this._batchesRepository.store.save(b);
	}

	updateDescription(description: string) {
		const b = this.batch$$$.value;
		if (!b) return;
		b.description = description;
		this._batchesRepository.store.save(b);
	}

	openSelectProject() {
		const sel = this.selectedProject();
		const dialogRef = this._projectsModals.openProjectSelectDialog({
			selectionConstraints: { single: true, minProjects: 1, maxProjects: 1 },
			alreadySelectedProjects: sel ? [sel] : [],
		});

		dialogRef.closed.subscribe((result) => {
			if (!result || result.projects.length === 0) return;
			const first = result.projects[0];
			const b = this.batch$$$.value;
			if (!b) return;
			b.projectId = first.id;
			this.selectedProject.set(first);
			this._batchesRepository.store.save(b);
		});
	}

	clearProject() {
		const b = this.batch$$$.value;
		if (!b) return;
		b.projectId = '';
		this.selectedProject.set(null);
		this._batchesRepository.store.save(b);
	}

	goToProject() {
		const p = this.selectedProject();
		if (!p) return;
		this._projectsRepository.goToProject(p.id);
	}
}
