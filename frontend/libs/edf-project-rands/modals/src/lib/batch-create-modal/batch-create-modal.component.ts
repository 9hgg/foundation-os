import { DialogRef, DIALOG_DATA } from '@angular/cdk/dialog';
import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Project } from '@edf/edf-project-rands/models';
import { ProjectsRepository } from '@edf/edf-project-rands/state';
import { ProjectsModals } from '../projects.modals';

export interface BatchCreateModalResult {
	title: string;
	prefix?: string;
	description?: string;
	projectId: string;
}

@Component({
	selector: 'lib-batch-create-modal',
	standalone: true,
	imports: [CommonModule, FormsModule],
	template: `
		<div class="modal-box bg-base-100 w-full max-w-md overflow-hidden rounded-2xl p-0 shadow-2xl">
			<div class="bg-base-200/50 border-base-200 flex items-center justify-between border-b px-6 py-4">
				<h3 class="flex items-center gap-2 text-lg font-bold">Create batch</h3>
				<button
					(click)="cancel()"
					class="btn btn-sm btn-circle btn-ghost"
				>
					✕
				</button>
			</div>

			<div class="space-y-4 p-6">
				<div>
					<label
						for="title"
						class="label"
						><span class="label-text">Title</span></label
					>
					<input
						id="title"
						class="input input-bordered w-full"
						[ngModel]="title()"
						(ngModelChange)="title.set($event)"
					/>
				</div>

				<div>
					<label
						for="prefix"
						class="label"
						><span class="label-text">Prefix (optional)</span></label
					>
					<input
						id="prefix"
						class="input input-bordered w-full"
						[ngModel]="prefix()"
						(ngModelChange)="prefix.set($event)"
					/>
				</div>

				<div>
					<label
						for="description"
						class="label"
						><span class="label-text">Description</span></label
					>
					<textarea
						id="description"
						class="textarea textarea-bordered w-full"
						rows="4"
						[ngModel]="description()"
						(ngModelChange)="description.set($event)"
					></textarea>
				</div>

				<div>
				<div class="label"><span class="label-text">Project</span></div>
				<div class="flex items-center gap-2">
					<div class="flex-1 text-sm">{{ selectedProject()?.name || '—' }}</div>
					<button class="btn btn-xs btn-outline" (click)="selectProject()">Select</button>
					<button class="btn btn-xs btn-ghost" (click)="clearProject()">Clear</button>
				</div>
			</div>
				<button
					class="btn btn-ghost"
					(click)="cancel()"
				>
					Cancel
				</button>
				<button
					class="btn btn-primary"
					[disabled]="!title() || !projectId()"
					(click)="save()"
				>
					Create
				</button>
			</div>
		</div>
	`,
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BatchCreateModalComponent {
	private _dialogRef = inject(DialogRef);
	private _projectsRepository = inject(ProjectsRepository);
	private _projectsModals = inject(ProjectsModals);

	// consume optional injected data
	private _data = inject<Partial<BatchCreateModalResult> | undefined>(DIALOG_DATA);

	title = signal<string>('');
	prefix = signal<string>('');
	description = signal<string>('');
	projectId = signal<string | null>(null);
	selectedProject = signal<Project | null>(null);

	constructor() {
		if (this._data?.title) this.title.set(this._data.title);
		if (this._data?.prefix) this.prefix.set(this._data.prefix);
		if (this._data?.description) this.description.set(this._data.description);
		if (this._data?.projectId) {
			this.projectId.set(this._data.projectId);
			this._projectsRepository.store.getObjectById$$$(this._data.projectId, true).$?.subscribe((p) => {
				if (p) this.selectedProject.set(p);
			});
		}
	}

	selectProject() {
		const selected = this.selectedProject();
		const alreadySelected = selected ? [selected] : [];
		const dialogRef = this._projectsModals.openProjectSelectDialog({
			selectionConstraints: { single: true, minProjects: 1, maxProjects: 1 },
			alreadySelectedProjects: alreadySelected,
		});

		dialogRef.closed.subscribe((result) => {
			if (!result || result.projects.length === 0) return;
			const first = result.projects[0];
			this.projectId.set(first.id);
			this.selectedProject.set(first);
		});
	}

	clearProject() {
		this.projectId.set(null);
		this.selectedProject.set(null);
	}
	close(result?: BatchCreateModalResult) {
		this._dialogRef.close(result);
	}

	cancel() {
		this.close();
	}

	save() {
		this.close({
			title: this.title(),
			prefix: this.prefix() || undefined,
			description: this.description() || undefined,
			projectId: this.projectId() || '',
		});
	}
}
