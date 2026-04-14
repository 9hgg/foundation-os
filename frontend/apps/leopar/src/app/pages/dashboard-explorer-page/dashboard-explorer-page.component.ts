import { Dialog } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, effect, inject, model } from '@angular/core';
import { Router, RouterModule } from '@angular/router';
import { ArticlesRepository } from '@foundation/articles/state';
import { createArticleExplorerResourceDefinition } from '@foundation/articles/ui';
import { FilesRepository } from '@foundation/files/state';
import { createFileExplorerResourceDefinition } from '@foundation/files/ui';
import { FoldersRepository } from '@foundation/folders/state';
import { createFolderExplorerResourceDefinition, FolderPathComponent } from '@foundation/folders/ui';
import { TwFolderArrowIcon } from '@foundation/icons';
import { EXPLORER_RESOURCE_DEFINITIONS, EXPLORER_ROOT_VIRTUAL_FOLDERS, ExplorerComponent, ExplorerResourceDefinition } from '@foundation/shared/explorer';
import { TeamsRepository } from '@foundation/teams/state';
import { createTeamExplorerResourceDefinition } from '@foundation/teams/ui';

@Component({
	selector: 'app-dashboard-explorer-page',
	standalone: true,
	imports: [RouterModule, FolderPathComponent, ExplorerComponent],
	templateUrl: './dashboard-explorer-page.component.html',
	styles: [
		`
			:host {
				display: block;
				height: 100%;
			}
		`,
	],
	changeDetection: ChangeDetectionStrategy.OnPush,
	host: {
		class: 'dashboard-page-host',
	},
	providers: [
		{
			provide: EXPLORER_RESOURCE_DEFINITIONS,
			useFactory: (articlesRepo: ArticlesRepository, teamsRepo: TeamsRepository, filesRepo: FilesRepository, foldersRepo: FoldersRepository, dialog: Dialog): ExplorerResourceDefinition[] => {
				return [
					//
					createArticleExplorerResourceDefinition(articlesRepo, dialog),
					createTeamExplorerResourceDefinition(teamsRepo, foldersRepo, dialog),
					createFileExplorerResourceDefinition(filesRepo, dialog),
					createFolderExplorerResourceDefinition(foldersRepo, dialog),
				];
			},
			deps: [ArticlesRepository, TeamsRepository, FilesRepository, FoldersRepository, Dialog],
		},
		{
			provide: EXPLORER_ROOT_VIRTUAL_FOLDERS,
			useValue: [
				{
					id: 'all-files',
					name: 'All files',
					link: ['/', 'host', 'dashboard', 'files'],
					iconComponent: TwFolderArrowIcon,
				},
			],
		},
	],
})
export class DashboardExplorerPageComponent {
	private _router = inject(Router);
	folderId = model<string | null>(null);

	constructor() {
		effect(() => {
			const folderId = this.folderId();

			// Update URL to keep in sync with selection
			this._router.navigate([], {
				queryParams: { folderId: folderId || null },
				queryParamsHandling: 'merge',
				preserveFragment: true,
			});
		});
	}
}
