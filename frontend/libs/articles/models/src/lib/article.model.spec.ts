import type { Article, ArticleConfig } from './article.model';

describe('article.model', () => {
	it('accepts the full article resource shape used by article features', () => {
		const publishedAt = new Date('2026-04-22T10:30:00.000Z');
		const article = {
			id: 'article-1',
			createdAt: publishedAt,
			updatedAt: publishedAt,
			title: 'Release notes',
			kind: 'support',
			slug: 'release-notes',
			featured: true,
			summary: 'What changed this week',
			content: '<p>Everything important.</p>',
			authorId: 'user-1',
			draft: false,
			timePublished: publishedAt,
			tags: ['release', 'support'],
			config: {
				commentsEnabled: true,
				images: {
					hero: {
						alt: 'Product screenshot',
						entityFileId: 'file-hero',
					},
				},
				deltas: null,
			},
		} satisfies Article;

		expect(article.kind).toBe('support');
		expect(article.featured).toBe(true);
		expect(article.draft).toBe(false);
		expect(article.config.images?.['hero'].entityFileId).toBe('file-hero');
	});

	it('allows the minimal required article fields', () => {
		const article = {
			id: 'article-2',
			kind: 'default',
			featured: false,
			draft: true,
			tags: [],
			config: {},
		} satisfies Article;

		expect(article.tags).toEqual([]);
		expect(article.config.commentsEnabled).toBeUndefined();
	});

	it('supports all article kinds currently exposed by the model', () => {
		const kinds: Article['kind'][] = ['default', 'support', 'backlog', 'assistant'];

		expect(kinds).toEqual(['default', 'support', 'backlog', 'assistant']);
	});

	it('types article config images by role and permits nullable quill deltas', () => {
		const config = {
			commentsEnabled: false,
			deltas: null,
			images: {
				thumbnail: {
					alt: 'Small preview',
					entityFileId: 'file-thumb',
				},
				cover: {
					alt: 'Cover',
					entityFileId: 'file-cover',
				},
			},
		} satisfies ArticleConfig;

		expect(Object.keys(config.images ?? {})).toEqual(['thumbnail', 'cover']);
		expect(config.deltas).toBeNull();
	});
});
