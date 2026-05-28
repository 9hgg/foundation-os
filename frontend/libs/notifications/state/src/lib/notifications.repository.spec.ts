import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { RequestService } from '@foundation/network/services';
import { NotificationService } from '@foundation/notification';
import { TranslationService } from '@foundation/translations/services';
import { TabManagerService } from '@foundation/utils';
import { NEVER, of } from 'rxjs';
import { NotificationsRepository } from './notifications.repository';

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

describe('NotificationsRepository', () => {
	let repository: NotificationsRepository;

	beforeEach(() => {
		vi.clearAllMocks();
		TestBed.configureTestingModule({
			providers: [
				NotificationsRepository,
				{ provide: Router, useValue: routerMock },
				{ provide: RequestService, useValue: requestServiceMock },
				{ provide: NotificationService, useValue: notificationMock },
				{ provide: TranslationService, useValue: translationMock },
				{ provide: TabManagerService, useValue: tabManagerServiceMock },
			],
		});
		repository = TestBed.inject(NotificationsRepository);
	});

	it('creates the repository', () => {
		expect(repository).toBeTruthy();
	});

	it('has a store with correct kind and api_url', () => {
		expect(repository.store).toBeTruthy();
		expect(repository.kind).toBe('notification');
		expect(repository.api_url).toBe('/api/notifications');
	});

	it('toggleRead$ calls the right endpoint', () => {
		requestServiceMock.post$.mockReturnValue(of({ result: { notification: { id: 'notif-1' } } }));
		repository.toggleRead$('notif-1').subscribe();
		expect(requestServiceMock.post$).toHaveBeenCalledWith('/api/notifications/notif-1/read/toggle', {});
	});

	it('toggleRead$ emits the response', () => {
		const notification = { id: 'notif-1' };
		requestServiceMock.post$.mockReturnValue(of({ result: { notification } }));

		let result: any;
		repository.toggleRead$('notif-1').subscribe((v) => (result = v));

		expect(result).toEqual({ result: { notification } });
	});
});
