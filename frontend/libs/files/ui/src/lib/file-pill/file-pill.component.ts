import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import { EntityFile } from '@foundation/files/models';
import { FilesRepository } from '@foundation/files/state';
import { filter, take } from 'rxjs';

@Component({
	selector: 'lib-file-pill',
	standalone: true,
	imports: [CommonModule],
	templateUrl: './file-pill.component.html',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FilePillComponent {
	private _filesRepository = inject(FilesRepository);

	entityFile = input<EntityFile | null>(null);
	fileId = input<string | null>(null);

	private _fetchedFile = signal<EntityFile | null>(null);
	private _loading = signal(false);

	resolvedFile = computed(() => this.entityFile() ?? this._fetchedFile());
	isLoading = computed(() => !this.resolvedFile() && !!this.fileId() && this._loading());

	filename = computed(() => {
		const f = this.resolvedFile();
		if (!f) return null;
		return f.publicFilename || f.originalFilename || 'Fichier';
	});

	extension = computed(() => {
		const f = this.resolvedFile();
		if (!f) return null;
		return (f.extension || f.extensionClient || '').replace(/^\./, '').toUpperCase() || null;
	});

	formattedSize = computed(() => {
		const f = this.resolvedFile();
		if (!f) return null;
		const raw = f.size ?? (f.sizeClient ? parseInt(f.sizeClient as unknown as string, 10) : null);
		if (!raw || isNaN(raw as number)) return null;
		const n = raw as number;
		if (n < 1024) return `${n} B`;
		if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
		return `${(n / 1024 / 1024).toFixed(1)} MB`;
	});

	constructor() {
		effect(() => {
			const fileId = this.fileId();
			if (!fileId || this.entityFile()) return;
			this._loading.set(true);
			this._filesRepository.store
				.getObjectByIdPullOnce$$$(fileId)
				.$.pipe(
					filter((file): file is EntityFile => !!file),
					take(1)
				)
				.subscribe((file) => {
					this._fetchedFile.set(file);
					this._loading.set(false);
				});
		});
	}
}
