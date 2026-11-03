/* eslint-disable @angular-eslint/prefer-inject */ import { CdkMenu, CdkMenuItem, CdkMenuModule } from '@angular/cdk/menu';
import { CommonModule } from '@angular/common';
import { Attribute, ChangeDetectionStrategy, Component, contentChild, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { Article } from '@foundation/articles/models';
import { ArticlesRepository } from '@foundation/articles/state';
import { RequestService } from '@foundation/network/services';
import { Filter } from '@foundation/network/store';
import { FoldersModals } from '@foundation/folders/modals';
import { AccessService } from '@foundation/shared/access';
import { BehaviorType, RepositoryTableComponent, TablePaginatorComponent } from '@foundation/table/ui';
import { TranslateDirective, TranslatePipe } from '@foundation/translations/services';
import { DateAsAgoPipe } from '@foundation/utils';
import { switchMap } from 'rxjs';
import { ArticleTableExpandedDirective } from './article-table-expanded.directive';

/** Live articles carry no state at all, so "not archived" is simply "state is null". */
const HIDE_ARCHIVED_FILTER: Filter = { fieldName: 'state', value: '~null', matchType: 'exact' };

@Component({
	selector: 'lib-article-table',
	standalone: true,
	imports: [
		TablePaginatorComponent,
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
	private _requestServiceForState = inject(RequestService);

	/** An archived article is filed away, not deleted: everyone can ask to see them again. */
	readonly isDisplayingArchived = signal(false);
	readonly isAdmin = toSignal(this._accessService.checkAdmin$(), { initialValue: false });

	articleKind: Article['kind'] | null;
	adminMode = false;
	readonly articleKinds: Article['kind'][] = ['default', 'support', 'backlog', 'assistant'];
	expandedItemTemplate = contentChild(ArticleTableExpandedDirective);

	constructor(
		private _repository: ArticlesRepository,
		@Attribute('article-kind') articleKind: Article['kind'] | null,
		@Attribute('click-behavior') clickBehavior: BehaviorType,
		@Attribute('include-anonymous') includeAnonymous: boolean | null,
		@Attribute('admin-mode') adminMode: string | null
	) {
		const isAdminMode = adminMode !== null;
		const effectiveArticleKind = articleKind ?? (isAdminMode ? null : 'default');
		super(
			_repository,
			{
				orderingBy: { fieldName: 'timeUpdated', direction: 'desc' },
				alwaysOnFilters: effectiveArticleKind
					? [
							{
								fieldName: 'kind',
								value: effectiveArticleKind,
								matchType: 'exact',
							},
							HIDE_ARCHIVED_FILTER,
						]
					: [HIDE_ARCHIVED_FILTER],
				requestFn: (page, pageSize, filters, orderingBy, forceRequest) => {
					return _repository.store.getObjects$(page, pageSize, filters, orderingBy, forceRequest, includeAnonymous ? false : undefined, isAdminMode);
				},
			},
			clickBehavior
		);

		this.articleKind = effectiveArticleKind;
		this.adminMode = isAdminMode;
		// check if article kind is supported
		if (this.articleKind && !['support', 'backlog', 'assistant', 'default'].includes(this.articleKind)) {
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
		this._notificationService.confirm(this._i18n_deleteSentence()).closed.subscribe((confirmed) => {
			if (!confirmed) return;
			this._repository.store
				.deleteObject$(article.id)
				.pipe(switchMap(() => this.paginator.refresh()))
				.subscribe();
		});
	}

	public goToArticle(articleId: string) {
		this._repository.goToArticle(articleId);
	}

	public openFolderSelectionModalFor(article: Article) {
		this._foldersModal.openFolderSelectionDialog().closed.subscribe((result) => {
			console.log('The folders selection dialog was closed with this result:', result);
			if (result && result.folders.length > 0) {
				const folder = result.folders[0];
				if (this.adminMode) {
					this._requestService.post$('/api/articles/admin/' + article.id + '/folder', { folderId: folder.id }).subscribe();
					return;
				}
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

	public updateKind(article: Article, kind: Article['kind']): void {
		if (article.kind === kind) return;
		this._repository.store
			.applyPatch(article.id, { kind })
			.pipe(switchMap(() => this.paginator.refresh()))
			.subscribe();
	}

	/** Admin: file an article away, or bring it back. Archiving also suspends its conversations,
	 *  so what was said stays readable and nothing new is accepted. */
	public toggleArchived(article: Article): void {
		const state = article.state === 'archived' ? null : 'archived';
		this._requestServiceForState
			.post$<Article>(`/api/articles/admin/${article.id}/state`, { state })
			.pipe(switchMap(() => this.paginator.refresh()))
			.subscribe();
	}

	/** Show the archived ones alongside the live ones, or hide them again. */
	public toggleDisplayArchived(): void {
		const isDisplayingArchived = !this.isDisplayingArchived();
		this.isDisplayingArchived.set(isDisplayingArchived);
		const kindFilters = this.articleKind ? [{ fieldName: 'kind', value: this.articleKind, matchType: 'exact' as const }] : [];
		this.paginator.setAlwaysOnFilters(isDisplayingArchived ? kindFilters : [...kindFilters, HIDE_ARCHIVED_FILTER]);
	}

	public toggleDraft(article: Article): void {
		this._repository.store
			.applyPatch(article.id, { draft: !article.draft })
			.pipe(switchMap(() => this.paginator.refresh()))
			.subscribe();
	}

	public toggleFeatured(article: Article): void {
		this._repository.store
			.applyPatch(article.id, { featured: !article.featured })
			.pipe(switchMap(() => this.paginator.refresh()))
			.subscribe();
	}

	public togglePublic(article: Article): void {
		this._repository.store
			.toggleAnonymousReadForObject$(article.id)
			.pipe(switchMap(() => this.paginator.refresh()))
			.subscribe();
	}
}
