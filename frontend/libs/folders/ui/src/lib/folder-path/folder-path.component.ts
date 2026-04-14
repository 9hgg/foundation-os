import { Folder } from '@foundation/folders/models';
import { FoldersRepository } from '@foundation/folders/state';
import { BehaviorSubjectReplayedProxied } from '@foundation/utils';
import { CdkMenuModule } from '@angular/cdk/menu';
import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, effect, inject, model } from '@angular/core';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { of, switchMap } from 'rxjs';

@Component({
	selector: 'lib-folder-path',
	standalone: true,
	imports: [
		//
		CommonModule,
		ReactiveFormsModule,
		FormsModule,
		CdkMenuModule,
		ReactiveFormsModule,
		CdkMenuModule,
	],
	templateUrl: './folder-path.component.html',
	styleUrl: './folder-path.component.css',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FolderPathComponent {
	private _foldersRepository = inject(FoldersRepository);

	folderId = model<string | null>(null);

	rootFolder$$$ = new BehaviorSubjectReplayedProxied<string | null, Folder | null>((id: string | null) => {
		return id ? this._foldersRepository.store.getObjectByIdPullOnce$$$(id).$ : of(null);
	}, null);

	parentFolder$ = this.rootFolder$$$.pipe(
		switchMap((rootFolder) => {
			if (rootFolder && rootFolder.parentId) return this._foldersRepository.store.getObjectByIdPullOnce$$$(rootFolder.parentId).$;
			return of(null);
		})
	);

	constructor() {
		effect(() => {
			const folderId = this.folderId();
			this.rootFolder$$$.next(folderId);
		});
	}

	public setFolderId(folderId: string | null) {
		this.folderId.set(folderId);
	}
}
