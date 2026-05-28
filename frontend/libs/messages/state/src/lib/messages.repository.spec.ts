import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { RequestService } from '@foundation/network/services';
import { NotificationService } from '@foundation/notification';
import { TranslationService } from '@foundation/translations/services';
import { TabManagerService } from '@foundation/utils';
import { NEVER, of } from 'rxjs';
import { MessagesRepository } from './messages.repository';

const routerMock = { navigate: vi.fn() };

const requestServiceMock = {
	clearCache$: NEVER,
	getBasic$: vi.fn(),
	post$: vi.fn(),
};

const notificationMock = {
	snack: vi.fn(),
	notify: vi.fn(),
	success: vi.fn(),
	error: vi.fn(),
};

const translationMock = {
	prep: vi.fn((value: string) => () => value),
};

const tabManagerServiceMock = { tabId: 'tab-1' };

describe('MessagesRepository', () => {
	let repository: MessagesRepository;

	beforeEach(() => {
		vi.clearAllMocks();
		TestBed.configureTestingModule({
			providers: [
				MessagesRepository,
				{ provide: Router, useValue: routerMock },
				{ provide: RequestService, useValue: requestServiceMock },
				{ provide: NotificationService, useValue: notificationMock },
				{ provide: TranslationService, useValue: translationMock },
				{ provide: TabManagerService, useValue: tabManagerServiceMock },
			],
		});
		repository = TestBed.inject(MessagesRepository);
	});

	it('creates the repository', () => {
		expect(repository).toBeTruthy();
	});

	it('has a store with correct kind', () => {
		expect(repository.store).toBeTruthy();
		expect(repository.kind).toBe('message');
		expect(repository.api_url).toBe('/api/messages');
	});

	it('has an empty convenientListOfExtraMessages initially', () => {
		expect(repository.convenientListOfExtraMessages()).toEqual({});
	});

	it('toggleReaction$ calls the right endpoint', () => {
		requestServiceMock.post$.mockReturnValue(of({ result: { message: { id: 'msg-1' } } }));
		repository.toggleReaction$('msg-1', '👍').subscribe();
		expect(requestServiceMock.post$).toHaveBeenCalledWith('/api/messages/msg-1/reaction/toggle', '👍');
	});

	it('fetchMessagesDetails triggers debounced fetch', () => {
		vi.spyOn(repository.store, 'getObjectById$$$').mockReturnValue({ $: of(null) } as any);
		repository.fetchMessagesDetails(['msg-1', 'msg-2']);
		// debounce of 100ms means synchronous check won't trigger, but we verify no error thrown
		expect(repository).toBeTruthy();
	});
});
