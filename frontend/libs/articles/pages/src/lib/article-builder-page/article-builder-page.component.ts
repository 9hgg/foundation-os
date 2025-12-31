import { Acl } from '@foundation/acls/model';
import { Article } from '@foundation/articles/models';
import { ArticlesRepository } from '@foundation/articles/state';
import { ConversationsRepository } from '@foundation/conversations/state';
import { FileModals } from '@foundation/files/modals';
import { EntityFile } from '@foundation/files/models';
import { convertToUrl } from '@foundation/files/state';
import { UploadButtonComponent } from '@foundation/files/ui';
import { NotificationService, QuestionMarkHelpComponent } from '@foundation/notification';
import { QuillService } from '@foundation/quill/utils';
import { TranslateDirective } from '@foundation/translations/services';
import { BehaviorSubjectReplayed, BehaviorSubjectReplayedProxied, SanitizeHtmlPipe, slugify } from '@foundation/utils';
import { CdkDropList } from '@angular/cdk/drag-drop';
import { CdkMenuModule } from '@angular/cdk/menu';
import { PortalModule } from '@angular/cdk/portal';
import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, ElementRef, inject, model, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import Quill, { Delta } from 'quill';
import { debounceTime, filter, of, skip, take, tap } from 'rxjs';

@Component({
	selector: 'lib-article-builder-page',
	standalone: true,
	imports: [
		//
		CommonModule,
		FormsModule,
		TranslateDirective,
		RouterModule,
		CdkMenuModule,
		PortalModule,
		CdkDropList,
		SanitizeHtmlPipe,
		UploadButtonComponent,
		QuestionMarkHelpComponent,
	],
	templateUrl: './article-builder-page.component.html',
	styleUrls: ['./article-builder-page.component.css'],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ArticleBuilderPageComponent {
	public notificationService = inject(NotificationService);
	private _articlesRepository = inject(ArticlesRepository);
	private _fileModals = inject(FileModals);
	private _conversationsRepository = inject(ConversationsRepository);
	private _quillService = inject(QuillService);

	public articleId = model<string | null>(null);
	article$$$ = new BehaviorSubjectReplayedProxied<string | null, Article | null>((id: string | null) => {
		return id ? this._articlesRepository.store.getObjectById$$$(id, true).$ : of(null);
	}, null);

	editing = signal(true);
	articleIsLoaded = signal(false);

	private _quillContainer = viewChild<ElementRef<HTMLDivElement>>('quillContainer');
	quill: Quill | null = null;

	articleContent$$$ = new BehaviorSubjectReplayed<{
		semanticHTML: string;
		content: Delta | null;
	}>({
		semanticHTML: '',
		content: null,
	});
	articleSummary = model<string>('');
	articleTitle = model<string>('');

	constructor() {
		// inject the article id into the behavior subject proxied
		effect(() => {
			const articleId = this.articleId();
			this.article$$$.next(articleId);
		});

		// initialise the values once the article is loaded
		this.article$$$
			.pipe(
				takeUntilDestroyed(),
				filter((article): article is Article => !!article),
				take(1),
				tap((article) => {
					this.articleContent$$$.next({
						semanticHTML: article.content || '',
						content: article.config['deltas'] || null,
					});
					this.articleTitle.set(article.title || '');
					this.articleSummary.set(article.summary || '');
					this.articleIsLoaded.set(true);

					if (article.timePublished) {
						this.editing.set(false);
					}

					// get ACLs for the article
					this.updateAcls();
				})
			)
			.subscribe();

		// react to new summary with a debounce
		toObservable(this.articleSummary)
			.pipe(
				takeUntilDestroyed(),
				debounceTime(300),
				tap((articleSummary) => {
					const article = this.article$$$.value;
					if (!article) return;

					// split the summary to get the first 200 characters
					const newSummary = articleSummary.length > 200 ? articleSummary.substring(0, 200) : articleSummary;
					article.summary = newSummary;
					this._articlesRepository.store.save(article);
				})
			)
			.subscribe();

		// react to new title with a debounce
		toObservable(this.articleTitle)
			.pipe(
				takeUntilDestroyed(),
				debounceTime(300),
				tap((articleTitle) => {
					const article = this.article$$$.value;
					if (!article) return;
					article.title = articleTitle;
					article.slug = slugify(articleTitle);
					this._articlesRepository.store.save(article);
				})
			)
			.subscribe();

		// create a new quill editor when the quillContainer is available
		effect(() => {
			const qc = this._quillContainer();
			const articleId = this.articleId();
			const articleIsLoaded = this.articleIsLoaded();
			if (!articleIsLoaded) return;
			if (!qc) return;
			if (!articleId) return;

			const selector = '[data-toolbar-id="toolbar-' + articleId + '"]';
			const toolbar = document.querySelector(selector);
			if (toolbar) {
				if (this.quill) {
					this._quillService.clearQuill(this.quill);
					this.quill = null;
				}
				const initialContent = this.articleContent$$$.value.content;
				this._quillService.loadQuill(articleId, initialContent, qc.nativeElement, (quillTextDetails) => {
					this.articleContent$$$.next(quillTextDetails);
				});
			}
		});

		// save article content when changing
		this.articleContent$$$
			.pipe(
				skip(2),
				takeUntilDestroyed(),
				debounceTime(300),
				tap((articleContent) => {
					const article = this.article$$$.value;
					if (!article) return;
					article.content = articleContent.semanticHTML;
					article.config['deltas'] = articleContent.content;
					this._articlesRepository.store.save(article);
				})
			)
			.subscribe();
	}

	updateFeatured(newFeatured: boolean) {
		const article = this.article$$$.value;
		if (!article) return;
		article.featured = newFeatured;
		this._articlesRepository.store.save(article);
	}

	addTag(tag: string) {
		const article = this.article$$$.value;
		if (!article || !tag.trim()) return;

		// Trim the tag and convert to lowercase
		const cleanTag = tag.trim().toLowerCase();

		// Prevent duplicate tags
		if (!article.tags.includes(cleanTag)) {
			article.tags.push(cleanTag);
			this._articlesRepository.store.save(article);
		}
	}

	removeTag(tag: string) {
		const article = this.article$$$.value;
		if (!article) return;

		// Remove the specific tag
		article.tags = article.tags.filter((t) => t !== tag);
		this._articlesRepository.store.save(article);
	}

	togglePublic() {
		const article = this.article$$$.value;
		if (!article) return;

		// update the article ACLs
		this._articlesRepository.store
			.toggleAnonymousReadForObject$(article.id)
			.pipe(
				tap((result) => {
					console.log('[ArticleBuilderPage](togglePublic) result', result);
					this.updateAcls();

					// if the article is public, update the published date
					if (result.result?.length) {
						article.timePublished = new Date();
						article.draft = false;
						this._articlesRepository.store.save(article);
					} else {
						// if the article is private, remove the published date
						article.timePublished = undefined;
						article.draft = true;
						this._articlesRepository.store.save(article);
					}
				})
			)
			.subscribe();
	}

	updateThumbnail(entityFile: EntityFile) {
		const article = this.article$$$.value;
		if (!article) return;
		const images = article.config['images'] || {};
		images['thumbnail'] = {
			alt: article.title ?? '',
			entityFileId: entityFile.id,
		};
		article.config['images'] = images;
		this._articlesRepository.store.save(article);
	}

	public processUploadedFilesForThumbnail(files: (EntityFile | undefined)[]) {
		console.log('You are uploading these files:', files);
		const files_ = files.filter((f): f is EntityFile => !!f);
		if (files_.length == 0) return;
		const fileToUse = files_[0];
		this.updateThumbnail(fileToUse);
	}

	public useAnExistingPictureForThumbnail() {
		this._fileModals
			.openFilesSelectionDialog({
				selectionConstraints: {
					single: true,
					maxFiles: 1,
					minFiles: 1,
				},
				filters: [{ fieldName: 'kind', value: 'image' }],
			})
			.closed.subscribe((result) => {
				console.log('The files selection dialog was closed with this result:', result);
				if (result?.files?.length) {
					const fileToUse: EntityFile = result.files[0];
					this.updateThumbnail(fileToUse);
				}
			});
	}
	public convertToUrl = convertToUrl;

	acls = signal<Acl[]>([]);
	anomymousRead = computed(() => {
		const acls = this.acls();
		return acls.some((acl) => acl.who === 'anonymous' && acl.operation === 'read');
	});
	updateAcls() {
		const article = this.article$$$.value;
		if (!article) return;
		this._articlesRepository.store
			.getAclsForObject$(article.id)
			.pipe(
				tap((aclsResponse) => {
					console.log('[ArticleBuilderPage](constructor) ACLs', aclsResponse);
					this.acls.set(aclsResponse.result ?? []);
				})
			)
			.subscribe();
	}

	updateCommentsEnabled(isEnabled: boolean): void {
		const article = this.article$$$.value;
		if (!article) return;
		if (!article.config) {
			article.config = {};
		}
		article.config.commentsEnabled = isEnabled;
		this._articlesRepository.store.save(article);

		if (isEnabled) {
			this._conversationsRepository
				.createConversationFor$(article.id, 'article', 'default')
				.pipe(
					take(1),
					tap((conversation) => {
						console.log('Conversation created or retrieved:', conversation);
					})
				)
				.subscribe();
		}
	}

	goToArticle(articleId: string) {
		this._articlesRepository.goToArticle(articleId, {
			inNewTab: true,
		});
	}
}
