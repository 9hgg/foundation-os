import { Folder } from '@foundation/folders/models';
import { FoldersRepository } from '@foundation/folders/state';
import { Filter } from '@foundation/network/store';
import { BehaviorType, RepositoryTableComponent } from '@foundation/table/ui';
import { BehaviorSubjectReplayedProxied } from '@foundation/utils';
import { CdkMenuModule } from '@angular/cdk/menu';
import { CommonModule } from '@angular/common';
import { Attribute, ChangeDetectionStrategy, Component, effect, model } from '@angular/core';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { of, switchMap } from 'rxjs';

@Component({
	selector: 'lib-folder-table',
	standalone: true,
	imports: [
		//
		CommonModule,
		ReactiveFormsModule,
		FormsModule,
		CdkMenuModule,
	],
	templateUrl: './folder-table.component.html',
	styleUrl: './folder-table.component.css',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FolderTableComponent extends RepositoryTableComponent<Folder, FoldersRepository> {
	folderId = model<string | null>(null);

	rootFolder$$$ = new BehaviorSubjectReplayedProxied<string | null, Folder | null>((id: string | null) => {
		return id ? this._repository.store.getObjectById$$$(id, true).$ : of(null);
	}, null);

	parentFolder$ = this.rootFolder$$$.pipe(
		switchMap((rootFolder) => {
			if (rootFolder && rootFolder.parentId) return this._repository.store.getObjectById$$$(rootFolder.parentId, true).$;
			return of(null);
		})
	);

	constructor(
		private _repository: FoldersRepository,
		@Attribute('click-behavior') clickBehavior: BehaviorType
	) {
		super(
			_repository,
			{
				orderingBy: {
					direction: 'desc',
					fieldName: 'time_created',
				},
				alwaysOnFilters: [
					{
						fieldName: 'parent_id',
						value: '~null',
						matchType: 'exact',
					},
				],
			},
			clickBehavior
		);

		// get folderId from the URL and update the paginatedFolders if needed
		effect(() => {
			const folderId = this.folderId();

			if (folderId) {
				const extraFilterOnParentId: Filter = {
					fieldName: 'parent_id',
					value: folderId,
					matchType: 'exact',
				};
				this.paginator.setAlwaysOnFilters([extraFilterOnParentId]);
			} else {
				const extraFilterOnParentId: Filter = {
					fieldName: 'parent_id',
					value: '~null',
					matchType: 'exact',
				};
				this.paginator.setAlwaysOnFilters([extraFilterOnParentId]);
			}
			this.rootFolder$$$.next(folderId);
		});
	}

	public renameFolder(folder: Folder) {
		this._repository
			.renameFolder(folder)
			.pipe(switchMap(() => this.paginator.refresh()))
			.subscribe();
	}

	public deleteFolder(folder: Folder) {
		this._repository
			.deleteFolder(folder)
			.pipe(switchMap(() => this.paginator.refresh()))
			.subscribe();
	}

	public createNewFolder() {
		this._repository
			.createNewFolder$(this.folderId())
			.pipe(switchMap(() => this.paginator.refresh()))
			.subscribe();
	}

	// public goToFolder(folderId: string | null) {
	// 	this._repository.goToFolder(folderId);
	// }

	// public openFolder(folderId: string | null) {
	// 	console.log('open folder:', folderId);

	// 	// set the query parameter folderId without removing other query parameters
	// 	this._router.navigate([], {
	// 		queryParams: { folderId },
	// 		queryParamsHandling: 'merge',
	// 	});
	// 	this.folderId.set(folderId);
	// }

	public setFolderId(folderId: string | null) {
		this.folderId.set(folderId);
	}

	override customFunction(folder: Folder): void {
		// Custom behavior for folder items
		this.setFolderId(folder.id);
	}
}
