import { fakeAsync, TestBed, tick } from '@angular/core/testing';
import { Message } from '@foundation/messages/models';
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
	deleteObject$: vi.fn(),
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

function buildMessage(id: string): Message {
	return { id, authorId: 'author-1', conversationId: 'conv-1', content: 'hi', kind: 'default', config: {} };
}

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
		// The constructor subscribes the debounced fetch pipeline; the fetchMessagesDetails tests
		// below need that subscription itself created inside their own fakeAsync zone for tick() to
		// drive its debounceTime timer, so those tests inject the repository themselves instead of
		// relying on this one.
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

	it('toggleReaction$ calls the right endpoint with the reaction as the payload', () => {
		requestServiceMock.post$.mockReturnValue(of({ result: { message: { id: 'msg-1' } } }));
		repository.toggleReaction$('msg-1', '👍').subscribe();
		expect(requestServiceMock.post$).toHaveBeenCalledWith('/api/messages/msg-1/reaction/toggle', '👍');
	});

	it('deleteAsAdmin$ calls the admin delete endpoint', () => {
		requestServiceMock.deleteObject$.mockReturnValue(of({ result: {} }));
		repository.deleteAsAdmin$('msg-1').subscribe();
		expect(requestServiceMock.deleteObject$).toHaveBeenCalledWith('/api/messages/admin/msg-1');
	});

	describe('fetchMessagesDetails', () => {
		// The debounced pipeline is wired up in the constructor, so each test injects its own
		// repository from inside the fakeAsync zone -- that is what lets tick() drive its
		// debounceTime(100) timer.
		it('debounces multiple calls within 100ms into a single fetch pass', fakeAsync(() => {
			const freshRepository = TestBed.runInInjectionContext(() => new MessagesRepository());
			const getObjectById$$$ = vi.spyOn(freshRepository.store, 'getObjectById$$$').mockReturnValue(of(buildMessage('msg-1')) as any);

			freshRepository.fetchMessagesDetails(['msg-1']);
			tick(50);
			freshRepository.fetchMessagesDetails(['msg-1', 'msg-2']);
			tick(100);

			// only the last call's ids are fetched -- debounceTime discards the intermediate emission
			expect(getObjectById$$$).toHaveBeenCalledTimes(2);
			expect(getObjectById$$$).toHaveBeenCalledWith('msg-1', true);
			expect(getObjectById$$$).toHaveBeenCalledWith('msg-2', true);
		}));

		it('populates convenientListOfExtraMessages once the message resolves', fakeAsync(() => {
			const freshRepository = TestBed.runInInjectionContext(() => new MessagesRepository());
			vi.spyOn(freshRepository.store, 'getObjectById$$$').mockReturnValue(of(buildMessage('msg-1')) as any);

			freshRepository.fetchMessagesDetails(['msg-1']);
			tick(100);

			expect(freshRepository.convenientListOfExtraMessages()['msg-1']).toEqual(buildMessage('msg-1'));
		}));

		it('does not add anything when the message resolves to null', fakeAsync(() => {
			const freshRepository = TestBed.runInInjectionContext(() => new MessagesRepository());
			const getObjectById$$$ = vi.spyOn(freshRepository.store, 'getObjectById$$$').mockReturnValue(of(null) as any);

			freshRepository.fetchMessagesDetails(['msg-1']);
			tick(100);

			expect(getObjectById$$$).toHaveBeenCalledWith('msg-1', true);
			expect(freshRepository.convenientListOfExtraMessages()).toEqual({});
		}));

		it('skips refetching a message that is already in the convenient list', fakeAsync(() => {
			const freshRepository = TestBed.runInInjectionContext(() => new MessagesRepository());
			const getObjectById$$$ = vi.spyOn(freshRepository.store, 'getObjectById$$$').mockReturnValue(of(buildMessage('msg-1')) as any);

			freshRepository.fetchMessagesDetails(['msg-1']);
			tick(100);
			expect(getObjectById$$$).toHaveBeenCalledTimes(1);

			freshRepository.fetchMessagesDetails(['msg-1', 'msg-2']);
			tick(100);

			// only msg-2 triggers a second fetch: msg-1 is already in the convenient list
			expect(getObjectById$$$).toHaveBeenCalledTimes(2);
			expect(getObjectById$$$.mock.calls[1]).toEqual(['msg-2', true]);
		}));

		it('accumulates several resolved messages without dropping earlier ones', fakeAsync(() => {
			const freshRepository = TestBed.runInInjectionContext(() => new MessagesRepository());
			vi.spyOn(freshRepository.store, 'getObjectById$$$').mockImplementation((id: string) => of(buildMessage(id)) as any);

			freshRepository.fetchMessagesDetails(['msg-1', 'msg-2']);
			tick(100);

			expect(Object.keys(freshRepository.convenientListOfExtraMessages())).toEqual(['msg-1', 'msg-2']);
		}));
	});
});
