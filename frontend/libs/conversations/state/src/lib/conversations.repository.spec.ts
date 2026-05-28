import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { RequestService } from '@foundation/network/services';
import { NotificationService } from '@foundation/notification';
import { TranslationService } from '@foundation/translations/services';
import { TabManagerService } from '@foundation/utils';
import { of, NEVER } from 'rxjs';
import { ConversationsRepository } from './conversations.repository';

const routerMock = { navigate: vi.fn() };

const requestServiceMock = {
	clearCache$: NEVER,
	getBasic$: vi.fn(),
	post$: vi.fn(),
	put$: vi.fn(),
};

const notificationMock = {
	snack: vi.fn(),
	notify: vi.fn(),
	success: vi.fn(),
	error: vi.fn(),
	confirm: vi.fn().mockReturnValue({ closed: of(true) }),
};

const translationMock = {
	prep: vi.fn((value: string) => () => value),
};

const tabManagerServiceMock = { tabId: 'tab-1' };

describe('ConversationsRepository', () => {
	let repo: ConversationsRepository;

	beforeEach(() => {
		vi.clearAllMocks();
		TestBed.configureTestingModule({
			providers: [
				ConversationsRepository,
				{ provide: Router, useValue: routerMock },
				{ provide: RequestService, useValue: requestServiceMock },
				{ provide: NotificationService, useValue: notificationMock },
				{ provide: TranslationService, useValue: translationMock },
				{ provide: TabManagerService, useValue: tabManagerServiceMock },
			],
		});
		repo = TestBed.inject(ConversationsRepository);
	});

	it('creates the repository', () => {
		expect(repo).toBeTruthy();
	});

	it('has a store', () => {
		expect(repo.store).toBeTruthy();
	});

	it('sets api_url and kind from constructor', () => {
		expect(repo.api_url).toBe('/api/conversations');
		expect(repo.kind).toBe('conversation');
	});

	it('createConversationFor$ calls the right endpoint', () => {
		const conversation = { id: 'conv-1', config: {} };
		requestServiceMock.post$.mockReturnValue(of({ result: { key: 'k', created: true, conversation } }));
		vi.spyOn(repo.store, 'getObjectById$$$').mockReturnValue({ $: of(conversation) } as any);
		vi.spyOn(repo.store, 'upsertObjectLocally').mockReturnValue(undefined as any);

		repo.createConversationFor$('res-1', 'article', 'default').subscribe();

		expect(requestServiceMock.post$).toHaveBeenCalledWith('/api/conversations/for/article/res-1/default', {});
	});

	it('createConversationFor$ returns null when no result', () => {
		requestServiceMock.post$.mockReturnValue(of({ result: null }));
		let result: any = 'not-set';
		repo.createConversationFor$('res-1', 'article', 'default').subscribe((v) => (result = v));
		expect(result).toBeNull();
	});

	it('getConversationFor$ calls the right endpoint', () => {
		requestServiceMock.getBasic$.mockReturnValue(of({ result: { conversation: null } }));

		repo.getConversationFor$('res-1', 'article', 'default').subscribe();

		expect(requestServiceMock.getBasic$).toHaveBeenCalledWith('/api/conversations/for/article/res-1/default');
	});

	it('getConversationFor$ returns null when conversation is absent', () => {
		requestServiceMock.getBasic$.mockReturnValue(of({ result: null }));
		let result: any = 'not-set';
		repo.getConversationFor$('res-1', 'article', 'default').subscribe((v) => (result = v));
		expect(result).toBeNull();
	});

	it('getConversationFor$ upserts conversation locally when found', () => {
		const conversation = { id: 'conv-2', config: {} };
		requestServiceMock.getBasic$.mockReturnValue(of({ result: { conversation } }));
		vi.spyOn(repo.store, 'getObjectById$$$').mockReturnValue({ $: of(conversation) } as any);
		vi.spyOn(repo.store, 'upsertObjectLocally').mockReturnValue(undefined as any);

		repo.getConversationFor$('res-1', 'article', 'default').subscribe();

		expect(repo.store.upsertObjectLocally).toHaveBeenCalledWith(conversation);
	});
});
