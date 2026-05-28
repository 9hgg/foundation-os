import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { RequestService } from '@foundation/network/services';
import { NotificationService } from '@foundation/notification';
import { TranslationService } from '@foundation/translations/services';
import { TabManagerService } from '@foundation/utils';
import { NEVER } from 'rxjs';
import { GenericRepository } from './generic.repository';
import { Injectable } from '@angular/core';

// Concrete subclass for testing (GenericRepository is abstract)
@Injectable()
class TestRepository extends GenericRepository<{ id: string; name: string }> {
	constructor() {
		super('widget');
	}
}

@Injectable()
class TestRepositoryWithUrl extends GenericRepository<{ id: string }> {
	constructor() {
		super('thing', '/api/custom-things');
	}
}

const routerMock = { navigate: vi.fn() };

const requestServiceMock = {
	clearCache$: NEVER,
	getBasic$: vi.fn(),
	post$: vi.fn(),
	put$: vi.fn(),
	delete$: vi.fn(),
};

const notificationMock = {
	snack: vi.fn(),
	notify: vi.fn(),
	success: vi.fn(),
	error: vi.fn(),
	confirm: vi.fn(),
	prompt: vi.fn(),
};

const translationMock = {
	prep: vi.fn((value: string) => () => value),
};

const tabManagerServiceMock = { tabId: 'tab-1' };

describe('GenericRepository', () => {
	let repo: TestRepository;
	let repoWithUrl: TestRepositoryWithUrl;

	beforeEach(() => {
		vi.clearAllMocks();
		TestBed.configureTestingModule({
			providers: [
				TestRepository,
				TestRepositoryWithUrl,
				{ provide: Router, useValue: routerMock },
				{ provide: RequestService, useValue: requestServiceMock },
				{ provide: NotificationService, useValue: notificationMock },
				{ provide: TranslationService, useValue: translationMock },
				{ provide: TabManagerService, useValue: tabManagerServiceMock },
			],
		});
		repo = TestBed.inject(TestRepository);
		repoWithUrl = TestBed.inject(TestRepositoryWithUrl);
	});

	it('creates a repository instance', () => {
		expect(repo).toBeTruthy();
	});

	it('sets api_url from kind when no url provided', () => {
		expect(repo.api_url).toBe('/api/widgets');
		expect(repo.kind).toBe('widget');
	});

	it('uses the provided api_url when given', () => {
		expect(repoWithUrl.api_url).toBe('/api/custom-things');
		expect(repoWithUrl.kind).toBe('thing');
	});

	it('initializes a SmartRestStore', () => {
		expect(repo.store).toBeTruthy();
	});

	it('injects Router', () => {
		expect((repo as any)._router).toBe(routerMock);
	});

	it('injects RequestService', () => {
		expect((repo as any)._requestService).toBe(requestServiceMock);
	});

	it('injects NotificationService', () => {
		expect((repo as any)._notificationService).toBe(notificationMock);
	});

	it('injects TranslationService', () => {
		expect((repo as any)._translationService).toBe(translationMock);
	});
});
