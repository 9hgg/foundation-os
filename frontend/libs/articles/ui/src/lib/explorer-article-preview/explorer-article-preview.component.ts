import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { Article } from '@foundation/articles/models';

@Component({
	selector: 'lib-explorer-article-preview',
	imports: [DatePipe],
	changeDetection: ChangeDetectionStrategy.OnPush,
	template: `
		@let article = resource();
		@if (article) {
			<div class="flex h-full flex-col gap-4 p-4">
				<div class="flex flex-col gap-2">
					<h3 class="text-base-content text-lg font-bold">{{ article.title || article.slug || 'Unnamed article' }}</h3>
					@if (article.summary) {
						<p class="text-base-content/70 text-sm">{{ article.summary }}</p>
					}
					<div class="flex flex-wrap gap-2">
						<span class="badge badge-sm" [class.badge-primary]="article.featured" [class.badge-ghost]="!article.featured">
							{{ article.featured ? 'Featured' : 'Standard' }}
						</span>
						<span class="badge badge-sm" [class.badge-success]="article.config.commentsEnabled" [class.badge-ghost]="!article.config.commentsEnabled">
							{{ article.config.commentsEnabled ? 'Comments on' : 'Comments off' }}
						</span>
						@if (hasThumbnail()) {
							<span class="badge badge-ghost badge-sm">Thumbnail</span>
						}
					</div>
					@if (visibleTags().length) {
						<div class="flex flex-wrap gap-2">
							@for (tag of visibleTags(); track tag) {
								<span class="badge badge-outline badge-sm">{{ tag }}</span>
							}
						</div>
					}
				</div>
				<div class="text-base-content/60 flex flex-col gap-2 text-sm">
					<div class="flex justify-between">
						<span class="font-medium">Kind</span>
						<span class="badge badge-ghost badge-sm">{{ article.kind }}</span>
					</div>
					@if (article.slug) {
						<div class="flex justify-between gap-4">
							<span class="font-medium">Slug</span>
							<span class="truncate">{{ article.slug }}</span>
						</div>
					}
					<div class="flex justify-between">
						<span class="font-medium">Draft</span>
						<span>{{ article.draft ? 'Yes' : 'No' }}</span>
					</div>
					@if (article.tags.length) {
						<div class="flex justify-between">
							<span class="font-medium">Tags</span>
							<span>{{ article.tags.length }}</span>
						</div>
					}
					@if (article.timePublished) {
						<div class="flex justify-between">
							<span class="font-medium">Published</span>
							<span>{{ article.timePublished | date: 'medium' }}</span>
						</div>
					}
					@if (article.timeCreated) {
						<div class="flex justify-between">
							<span class="font-medium">Created</span>
							<span>{{ article.timeCreated | date: 'medium' }}</span>
						</div>
					}
				</div>
			</div>
		}
	`,
})
export class ExplorerArticlePreviewComponent {
	resource = input<Article | null>(null);

	visibleTags = computed(() => this.resource()?.tags.slice(0, 4) ?? []);
	hasThumbnail = computed(() => !!this.resource()?.config.images?.['thumbnail']?.entityFileId);
}
