import { Article } from '@foundation/articles/models';
import { ArticlesRepository } from '@foundation/articles/state';
import { FoldersModals } from '@foundation/folders/modals';
import { TranslationsRepository } from '@foundation/translations/state';
import { TranslationService } from '@foundation/translations/services';
import { TranslationTableComponent } from '@foundation/translations/ui';
import { TranslatePipe, TranslateDirective } from '@foundation/translations/services';
import { AccessService } from '@foundation/shared/access';
import { BehaviorType, RepositoryTableComponent } from '@foundation/table/ui';
import { DateAsAgoPipe } from '@foundation/utils';
import { CdkMenu, CdkMenuItem, CdkMenuModule } from '@angular/cdk/menu';
import { CommonModule } from '@angular/common';
import { Attribute, ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { switchMap } from 'rxjs';

@Component({
	selector: 'lib-article-table',
	standalone: true,
	imports: [
		//
		CommonModule,
		ReactiveFormsModule,
		FormsModule,
		CdkMenuModule,
		CdkMenu,
		CdkMenuItem,
		TranslateDirective,
		TranslatePipe,
		DateAsAgoPipe,
	],
	templateUrl: './article-table.component.html',
	styleUrl: './article-table.component.css',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ArticleTableComponent extends RepositoryTableComponent<Article, ArticlesRepository> {
	private _foldersModal = inject(FoldersModals);
	private _accessService = inject(AccessService);

	articleKind: Article['kind'] | null;

	constructor(
		private _repository: ArticlesRepository,
		@Attribute('article-kind') articleKind: Article['kind'] | null,
		@Attribute('click-behavior') clickBehavior: BehaviorType,
		@Attribute('include-anonymous') includeAnonymous: boolean | null
	) {
		super(
			_repository,
			{
				orderingBy: { fieldName: 'timeUpdated', direction: 'desc' },
				alwaysOnFilters: [
					{
						fieldName: 'kind',
						value: articleKind ?? 'default',
						matchType: 'exact',
					},
				],
				requestFn: (page, pageSize, filters, orderingBy, forceRequest) => {
					return _repository.store.getObjects$(page, pageSize, filters, orderingBy, forceRequest, includeAnonymous ? false : undefined);
				},
			},
			clickBehavior
		);

		// Set the article kind for the table
		this.articleKind = articleKind;
		// check if article kind is supported
		if (!this.articleKind || !['support', 'backlog', 'default'].includes(this.articleKind)) {
			console.warn(`Unsupported article kind: ${this.articleKind}`);
		}
	}

	private _i18n_renameSentence = this._translationService.prep('Give it a new name:');
	public renameArticle(article: Article) {
		const newName = prompt(this._i18n_renameSentence(), article.title ?? '');
		if (!newName) return;

		this._repository.store
			.putObject$({ ...article, title: newName })
			.pipe(switchMap(() => this.paginator.refresh()))
			.subscribe();
	}

	private _i18n_deleteSentence = this._translationService.prep('Are you sure you want to delete this article?');
	public deleteArticle(article: Article) {
		if (!confirm(this._i18n_deleteSentence())) return;
		this._repository.store
			.deleteObject$(article.id)
			.pipe(switchMap(() => this.paginator.refresh()))
			.subscribe();
	}

	public goToArticle(articleId: string) {
		this._repository.goToArticle(articleId);
	}

	public openFolderSelectionModalFor(article: Article) {
		this._foldersModal.openFolderSelectionDialog().closed.subscribe((result) => {
			console.log('The folders selection dialog was closed with this result:', result);
			if (result && result.folders.length > 0) {
				const folder = result.folders[0];
				this._requestService.getBasic$('/api/folders/' + folder.id + '/add/article/' + article.id).subscribe();
			}
		});
	}

	public shareArticle(article: Article) {
		this._accessService.openSharingDetails(article.id, 'article');
	}

	public shareArticleWithTeam(article: Article) {
		this._accessService.shareWithTeam(article.id, 'article');
	}
}
