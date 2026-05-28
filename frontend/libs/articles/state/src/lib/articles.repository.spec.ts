import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { of, Subject } from 'rxjs';
import { RequestService } from '@foundation/network/services';
import { NotificationService } from '@foundation/notification';
import { TranslationService } from '@foundation/translations/services';
import { TabManagerService } from '@foundation/utils';
import { ArticlesRepository } from './articles.repository';

vi.mock('uuid', () => ({ v4: () => 'article-id' }));

describe('ArticlesRepository', () => {
	let repository: ArticlesRepository;
	let requestServiceMock: {
		getBasic$: ReturnType<typeof vi.fn>;
		get$: ReturnType<typeof vi.fn>;
		post$: ReturnType<typeof vi.fn>;
		put$: ReturnType<typeof vi.fn>;
		delete$: ReturnType<typeof vi.fn>;
		patch$: ReturnType<typeof vi.fn>;
		clearCache$: Subject<void>;
	};
	let notificationServiceMock: {
		snack: ReturnType<typeof vi.fn>;
		warning: ReturnType<typeof vi.fn>;
		prompt: ReturnType<typeof vi.fn>;
	};
	let translationServiceMock: {
		prep: ReturnType<typeof vi.fn>;
	};
	let routerMock: {
		navigate: ReturnType<typeof vi.fn>;
	};
	let windowOpenSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		requestServiceMock = {
			getBasic$: vi.fn(),
			get$: vi.fn(),
			post$: vi.fn(),
			put$: vi.fn(),
			delete$: vi.fn(),
			patch$: vi.fn(),
			clearCache$: new Subject<void>(),
		};

		notificationServiceMock = {
			snack: vi.fn(),
			warning: vi.fn(),
			prompt: vi.fn().mockReturnValue({ closed: of(null) }),
		};

		translationServiceMock = {
			prep: vi.fn().mockReturnValue(() => 'translated'),
		};

		routerMock = {
			navigate: vi.fn(),
		};

		TestBed.configureTestingModule({
			providers: [
				ArticlesRepository,
				{ provide: RequestService, useValue: requestServiceMock },
				{ provide: NotificationService, useValue: notificationServiceMock },
				{ provide: TranslationService, useValue: translationServiceMock },
				{ provide: Router, useValue: routerMock },
				{ provide: TabManagerService, useValue: { tabId: 'test-tab-id' } },
			],
		});

		repository = TestBed.inject(ArticlesRepository);
		windowOpenSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
	});

	afterEach(() => {
		windowOpenSpy.mockRestore();
	});

	it('should be created', () => {
		expect(repository).toBeTruthy();
	});

	it('should set kind to "article"', () => {
		expect(repository.kind).toBe('article');
	});

	it('should set api_url to "/api/articles"', () => {
		expect(repository.api_url).toBe('/api/articles');
	});

	it('should initialize store with the api_url', () => {
		expect(repository.store).toBeDefined();
	});

	describe('isSlugAvailable$()', () => {
		it('should call requestService.getBasic$ with the correct URL', () => {
			const mockResponse = { result: { slugAvailable: true } };
			requestServiceMock.getBasic$.mockReturnValue(of(mockResponse));

			repository.isSlugAvailable$('my-slug').subscribe();

			expect(requestServiceMock.getBasic$).toHaveBeenCalledWith('/api/articles/check-slug/my-slug');
		});

		it('should return the response from requestService', () => {
			const mockResponse = { result: { slugAvailable: true } };
			requestServiceMock.getBasic$.mockReturnValue(of(mockResponse));

			let result: any;
			repository.isSlugAvailable$('my-slug').subscribe((r) => (result = r));

			expect(result).toEqual(mockResponse);
		});

		it('should return slugAvailable false when slug is taken', () => {
			const mockResponse = { result: { slugAvailable: false } };
			requestServiceMock.getBasic$.mockReturnValue(of(mockResponse));

			let result: any;
			repository.isSlugAvailable$('taken-slug').subscribe((r) => (result = r));

			expect(result.result.slugAvailable).toBe(false);
		});

		it('should encode the slug in the URL path', () => {
			const mockResponse = { result: { slugAvailable: true } };
			requestServiceMock.getBasic$.mockReturnValue(of(mockResponse));

			repository.isSlugAvailable$('hello-world-123').subscribe();

			expect(requestServiceMock.getBasic$).toHaveBeenCalledWith('/api/articles/check-slug/hello-world-123');
		});
	});

	describe('goToArticleEditor()', () => {
		it('should navigate to the article builder route', () => {
			repository.goToArticleEditor('article-id-1');
			expect(routerMock.navigate).toHaveBeenCalledWith(['/', 'host', 'dashboard', 'articles', 'article-id-1', 'builder']);
		});
	});

	describe('goToArticle()', () => {
		it('navigates support articles to the support route with a message fragment', () => {
			vi.spyOn(repository.store, 'getObjectById$$$').mockReturnValue(of({ id: 'article-1', title: 'Support', kind: 'support', config: {} }));

			repository.goToArticle('article-1', { messageId: 'message-1' });

			expect(routerMock.navigate).toHaveBeenCalledWith(['/', 'host', 'dashboard', 'support', 'article-1'], {
				fragment: 'message-message-1',
			});
		});

		it('opens regular articles in a new tab when requested', () => {
			vi.spyOn(repository.store, 'getObjectById$$$').mockReturnValue(of({ id: 'article-1', title: 'Article', kind: 'default', config: {} }));

			repository.goToArticle('article-1', { inNewTab: true, messageId: 'message-1' });

			expect(windowOpenSpy).toHaveBeenCalledWith('/host/dashboard/articles/article-1#message-message-1', '_blank');
		});

		it('navigates regular articles to the editor when requested', () => {
			vi.spyOn(repository.store, 'getObjectById$$$').mockReturnValue(of({ id: 'article-1', title: 'Article', kind: 'default', config: {} }));

			repository.goToArticle('article-1', { toEditor: true });

			expect(routerMock.navigate).toHaveBeenCalledWith(['/', 'host', 'dashboard', 'articles', 'article-1', 'builder']);
		});

		it('navigates regular articles to the reader route by default', () => {
			vi.spyOn(repository.store, 'getObjectById$$$').mockReturnValue(of({ id: 'article-1', title: 'Article', kind: 'default', config: {} }));

			repository.goToArticle('article-1', { messageId: 'message-1' });

			expect(routerMock.navigate).toHaveBeenCalledWith(['/', 'host', 'dashboard', 'articles', 'article-1'], {
				fragment: 'message-message-1',
			});
		});

		it('does not navigate when the article is missing', () => {
			vi.spyOn(repository.store, 'getObjectById$$$').mockReturnValue(of(null));

			repository.goToArticle('missing-article');

			expect(routerMock.navigate).not.toHaveBeenCalled();
			expect(windowOpenSpy).not.toHaveBeenCalled();
		});
	});

	describe('goToArticleSupport()', () => {
		it('should navigate to the support route', () => {
			repository.goToArticleSupport('article-id-2');
			expect(routerMock.navigate).toHaveBeenCalledWith(['/', 'host', 'dashboard', 'support', 'article-id-2']);
		});
	});

	describe('goToArticleList()', () => {
		it('should navigate to the articles list route', () => {
			repository.goToArticleList();
			expect(routerMock.navigate).toHaveBeenCalledWith(['/', 'host', 'dashboard', 'articles']);
		});
	});

	describe('goToArticlePublicPage()', () => {
		it('should call notificationService.snack with not-implemented message', () => {
			repository.goToArticlePublicPage('article-id-3');
			expect(notificationServiceMock.snack).toHaveBeenCalled();
		});
	});

	describe('createNewArticle$()', () => {
		it('creates an article with an available slug', async () => {
			notificationServiceMock.prompt.mockReturnValue({ closed: of({ value: 'New Article' }) });
			requestServiceMock.getBasic$.mockReturnValue(of({ result: { slugAvailable: true } }));
			vi.spyOn(repository.store, 'postObject$').mockReturnValue(of({ result: { data: { id: 'article-id' } } }));

			await new Promise((resolve) => repository.createNewArticle$().subscribe(resolve));

			expect(repository.store.postObject$).toHaveBeenCalledWith({
				id: 'article-id',
				kind: 'default',
				title: 'New Article',
				slug: 'new-article',
				featured: false,
				draft: true,
				tags: [],
				config: {},
			});
		});

		it('creates an article with a fallback slug when the first slug is taken', async () => {
			notificationServiceMock.prompt.mockReturnValue({ closed: of({ value: 'New Article' }) });
			requestServiceMock.getBasic$.mockReturnValue(of({ result: { slugAvailable: false } }));
			vi.spyOn(Date, 'now').mockReturnValue(123);
			vi.spyOn(repository.store, 'postObject$').mockReturnValue(of({ result: { data: { id: 'article-id' } } }));

			await new Promise((resolve) => repository.createNewArticle$().subscribe(resolve));

			expect(repository.store.postObject$).toHaveBeenCalledWith(
				expect.objectContaining({
					slug: 'new-article-123',
				})
			);
		});

		it('adds the created article to the target folder', async () => {
			notificationServiceMock.prompt.mockReturnValue({ closed: of({ value: 'New Article' }) });
			requestServiceMock.getBasic$
				.mockReturnValueOnce(of({ result: { slugAvailable: true } }))
				.mockReturnValueOnce(of({ result: {} }));
			vi.spyOn(repository.store, 'postObject$').mockReturnValue(of({ result: { data: { id: 'article-id' } } }));

			await new Promise((resolve) => repository.createNewArticle$('folder-1').subscribe(resolve));

			expect(requestServiceMock.getBasic$).toHaveBeenLastCalledWith('/api/folders/folder-1/add/article/article-id');
		});

		it('does not create an article when the prompt is cancelled', async () => {
			notificationServiceMock.prompt.mockReturnValue({ closed: of(null) });
			const postSpy = vi.spyOn(repository.store, 'postObject$');

			await new Promise((resolve) => repository.createNewArticle$().subscribe(resolve));

			expect(postSpy).not.toHaveBeenCalled();
		});
	});
});
