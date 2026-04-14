import { Dialog } from '@angular/cdk/dialog';
import { Article } from '@foundation/articles/models';
import { ArticlesRepository } from '@foundation/articles/state';
import { TwArticleIcon } from '@foundation/icons';
import { AccessShareModalComponent } from '@foundation/shared/access';
import { defineExplorerResource, ExplorerResourceDefinition } from '@foundation/shared/explorer';
import { map } from 'rxjs';
import { ExplorerArticlePreviewComponent } from './explorer-article-preview/explorer-article-preview.component';

export function createArticleExplorerResourceDefinition(articlesRepo: ArticlesRepository, dialog: Dialog): ExplorerResourceDefinition<Article> {
	return defineExplorerResource<Article>({
		kind: 'article',
		onShare: (r) => dialog.open(AccessShareModalComponent, { data: { resourceId: r.id, resourceKind: 'article' } }),
		load: (id) => articlesRepo.store.getObjectByIdPullOnce$$$(id).$,
		getName: (r) => r.title || r.slug || 'Unknown article',
		iconComponent: TwArticleIcon,
		previewComponent: ExplorerArticlePreviewComponent,
		viewLink: (r) => ['/host/dashboard/articles', r.id],
		actions: [{ label: 'Edit', onClick: (r) => window.open('/host/dashboard/articles/' + r.id + '/builder', '_blank'), styleClass: 'btn-ghost' }],
		createAction: {
			label: 'New Article',
			iconComponent: TwArticleIcon,
			onClick: (folderId) =>
				articlesRepo.createNewArticle$(folderId).pipe(
					map((r: any) => {
						const articleId = r?.result?.data?.id;
						if (articleId) {
							window.open('/host/dashboard/articles/' + articleId + '/builder', '_blank');
						}
					})
				),
		},
	});
}
