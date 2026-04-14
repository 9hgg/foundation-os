import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Batch, Project } from '@edf/edf-project-rands/models';
import { BatchesRepository, ProjectsRepository } from '@edf/edf-project-rands/state';
import { QuillTextareaComponent } from '@foundation/quill/ui';
import { ProjectsModals } from '../projects.modals';
import { take } from 'rxjs';

export interface ActivityCreateModalData {
	title?: string;
	prefix?: string | null;
	description?: string | null;
	finality?: string | null;
	strategicInterests?: string | null;
	synergies?: string | null;
	risks?: string | null;
	parades?: string | null;
	projectId?: string | null;
	batchId?: string | null;
	priority?: number;
	isCorporate?: boolean;
	isConfirmed?: boolean;
	tags?: string[];
}

export interface ActivityCreateModalResult {
	title: string;
	prefix?: string;
	batchId: string;
	description?: string;
	finality?: string;
	strategicInterests?: string;
	synergies?: string;
	risks?: string;
	parades?: string;
	priority: number;
	isCorporate: boolean;
	isConfirmed: boolean;
	tags: string[];
}

@Component({
	selector: 'lib-activity-create-modal',
	standalone: true,
	imports: [CommonModule, FormsModule, QuillTextareaComponent],
	template: `
		<div class="modal-box bg-base-100 w-full max-w-md overflow-hidden rounded-2xl p-0 shadow-2xl">
			<div class="bg-base-200/50 border-base-200 flex items-center justify-between border-b px-6 py-4">
				<h3 class="flex items-center gap-2 text-lg font-bold">Create activity</h3>
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
			</div>

			<div class="space-y-4 p-6">
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

			<div class="space-y-4 p-6">
				<div class="label"><span class="label-text">Project</span></div>
				<div class="flex items-center gap-2">
					<div class="flex-1 text-sm">{{ selectedProject()?.name || '—' }}</div>
					<button
						class="btn btn-xs btn-outline"
						(click)="selectProject()"
					>
						Select
					</button>
					<button
						class="btn btn-xs btn-ghost"
						(click)="clearProject()"
					>
						Clear
					</button>
				</div>
			</div>

			<div class="space-y-4 p-6">
				<label
					for="batch"
					class="label"
					><span class="label-text">Batch</span></label
				>
				<select
					id="batch"
					class="select select-bordered w-full"
					[ngModel]="batchId()"
					(ngModelChange)="batchId.set($event)"
					[disabled]="!selectedProject()"
				>
					<option value="">-- select batch --</option>
					@for (b of batches(); track b.id) {
						<option [value]="b.id">{{ b.prefix ?? '...' }} - {{ b.title }}</option>
					}
				</select>
			</div>

			<div class="space-y-4 p-6">
				<label
					for="description"
					class="label"
					><span class="label-text">Description (optional)</span></label
				>
				<lib-quill-textarea
					id="description"
					[html]="description()"
					(htmlChange)="description.set($event)"
				></lib-quill-textarea>
			</div>

			<div class="space-y-4 p-6">
				<div>
					<label
						for="strategicInterests"
						class="label"
						><span class="label-text">Strategic interests</span></label
					>
					<textarea
						id="strategicInterests"
						rows="3"
						class="textarea textarea-bordered textarea-sm w-full"
						[ngModel]="strategicInterests()"
						(ngModelChange)="strategicInterests.set($event)"
					></textarea>
				</div>

				<div>
					<label
						for="finality"
						class="label"
						><span class="label-text">Finality</span></label
					>
					<textarea
						id="finality"
						rows="3"
						class="textarea textarea-bordered textarea-sm w-full"
						[ngModel]="finality()"
						(ngModelChange)="finality.set($event)"
					></textarea>
				</div>

				<div>
					<label
						for="synergies"
						class="label"
						><span class="label-text">Synergies</span></label
					>
					<textarea
						id="synergies"
						rows="3"
						class="textarea textarea-bordered textarea-sm w-full"
						[ngModel]="synergies()"
						(ngModelChange)="synergies.set($event)"
					></textarea>
				</div>

				<div>
					<label
						for="risks"
						class="label"
						><span class="label-text">Risks</span></label
					>
					<textarea
						id="risks"
						rows="3"
						class="textarea textarea-bordered textarea-sm w-full"
						[ngModel]="risks()"
						(ngModelChange)="risks.set($event)"
					></textarea>
				</div>

				<div>
					<label
						for="parades"
						class="label"
						><span class="label-text">Parades</span></label
					>
					<textarea
						id="parades"
						rows="3"
						class="textarea textarea-bordered textarea-sm w-full"
						[ngModel]="parades()"
						(ngModelChange)="parades.set($event)"
					></textarea>
				</div>

				<div class="grid grid-cols-3 gap-4">
					<div>
						<label
							for="priority"
							class="label"
							><span class="label-text">Priority</span></label
						>
						<input
							id="priority"
							type="number"
							class="input input-bordered w-full"
							[ngModel]="priority()"
							(ngModelChange)="priority.set(+$event || 0)"
						/>
					</div>
					<div>
						<label
							for="isCorporate"
							class="label"
							><span class="label-text">Corporate</span></label
						>
						<input
							id="isCorporate"
							type="checkbox"
							class="checkbox"
							[checked]="isCorporate()"
							(change)="isCorporate.set($any($event.target).checked)"
						/>
					</div>
					<div>
						<label
							for="isConfirmed"
							class="label"
							><span class="label-text">Confirmed</span></label
						>
						<input
							id="isConfirmed"
							type="checkbox"
							class="checkbox"
							[checked]="isConfirmed()"
							(change)="isConfirmed.set($any($event.target).checked)"
						/>
					</div>
				</div>

				<div class="grid grid-cols-1 gap-4">
					<label
						for="tags"
						class="label"
						><span class="label-text">Tags (comma separated)</span></label
					>
					<input
						id="tags"
						class="input input-bordered w-full"
						[ngModel]="tagsStr()"
						(ngModelChange)="tagsStr.set($event)"
					/>
				</div>

				<div class="bg-base-200/50 border-base-200 flex justify-end gap-2 border-t px-6 py-4">
					<button
						class="btn btn-ghost"
						(click)="cancel()"
					>
						Cancel
					</button>
					<button
						class="btn btn-primary"
						[disabled]="!title() || !batchId()"
						(click)="save()"
					>
						Create
					</button>
				</div>
			</div>
		</div>
	`,
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ActivityCreateModalComponent {
	private _dialogRef = inject(DialogRef);
	private _data = inject<ActivityCreateModalData | undefined>(DIALOG_DATA);
	private _projectsRepository = inject(ProjectsRepository);
	private _projectsModals = inject(ProjectsModals);
	private _batchesRepository = inject(BatchesRepository);

	title = signal<string>('');
	prefix = signal<string>('');
	description = signal<string>('');
	finality = signal<string>('');
	strategicInterests = signal<string>('');
	synergies = signal<string>('');
	risks = signal<string>('');
	parades = signal<string>('');
	projectId = signal<string | null>(null);
	selectedProject = signal<Project | null>(null);
	batchId = signal<string | null>(null);
	priority = signal<number>(0);
	isCorporate = signal<boolean>(false);
	isConfirmed = signal<boolean>(false);
	tagsStr = signal<string>('');
	batches = signal<Batch[]>([]);

	constructor() {
		if (this._data?.title) this.title.set(this._data.title);

		if (this._data?.projectId) {
			this.projectId.set(this._data.projectId);
			this._projectsRepository.store.getObjectById$$$(this._data.projectId, true).$?.subscribe((p: Project | null) => {
				if (p) this.selectedProject.set(p);
			});
			this._loadBatchesForProject(this._data.projectId);
		}

		if (this._data?.batchId) {
			this.batchId.set(this._data.batchId);
			// ensure the batch is available in the list (useful when projectId not provided)
			this._batchesRepository.store.getObjectById$$$(this._data.batchId, true).$?.subscribe((b: Batch | null) => {
				if (b) {
					this.batches.set([b]);
					if (!this.projectId() && b.projectId) {
						this.projectId.set(b.projectId);
						this._projectsRepository.store.getObjectById$$$(b.projectId, true).$?.subscribe((p: Project | null) => {
							if (p) this.selectedProject.set(p);
						});
					}
				}
			});
		}

		if (this._data?.priority !== undefined) this.priority.set(this._data.priority);
		if (this._data?.isCorporate !== undefined) this.isCorporate.set(this._data.isCorporate);
		if (this._data?.isConfirmed !== undefined) this.isConfirmed.set(this._data.isConfirmed);
		if (this._data?.tags?.length) this.tagsStr.set(this._data.tags.join(', '));
		if (this._data?.prefix) this.prefix.set(this._data.prefix);
		if (this._data?.description) this.description.set(this._data.description);
		if (this._data?.finality) this.finality.set(this._data.finality);
		if (this._data?.strategicInterests) this.strategicInterests.set(this._data.strategicInterests);
		if (this._data?.synergies) this.synergies.set(this._data.synergies);
		if (this._data?.risks) this.risks.set(this._data.risks);
		if (this._data?.parades) this.parades.set(this._data.parades);
	}

	private _loadBatchesForProject(projectId: string) {
		this._batchesRepository.store
			.getObjects$(1, 100, [{ fieldName: 'project_id', matchType: 'exact', value: projectId }], 'prefix:asc', true)
			.pipe(take(1))
			.subscribe((response) => {
				const holedBatches: (Batch | null)[] = response?.data || [];
				const batches = holedBatches.filter((b): b is Batch => b !== null);
				this.batches.set(batches);
			});
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
			const firstProject = result.projects[0];
			this.projectId.set(firstProject.id);
			this.selectedProject.set(firstProject);
			// load batches for selected project
			this._loadBatchesForProject(firstProject.id);
			// clear selected batch
			this.batchId.set(null);
		});
	}

	clearProject() {
		this.projectId.set(null);
		this.selectedProject.set(null);
		this.batches.set([]);
		this.batchId.set(null);
	}

	close(result?: ActivityCreateModalResult) {
		this._dialogRef.close(result);
	}

	cancel() {
		this.close();
	}

	save() {
		const r: ActivityCreateModalResult = {
			title: this.title(),
			prefix: this.prefix() || undefined,
			batchId: this.batchId() || '',
			description: this.description() || undefined,
			finality: this.finality() || undefined,
			strategicInterests: this.strategicInterests() || undefined,
			synergies: this.synergies() || undefined,
			risks: this.risks() || undefined,
			parades: this.parades() || undefined,
			priority: this.priority(),
			isCorporate: this.isCorporate(),
			isConfirmed: this.isConfirmed(),
			tags: this.tagsStr()
				.split(',')
				.map((t) => t.trim())
				.filter(Boolean),
		};
		this.close(r);
	}
}
