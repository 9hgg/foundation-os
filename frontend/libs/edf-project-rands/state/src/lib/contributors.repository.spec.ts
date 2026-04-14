import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { of } from 'rxjs';
import { RequestService } from '@foundation/network/services';
import { createMockRequestService } from '@foundation/network/services/testing';
import { NotificationService } from '@foundation/notification';
import { createMockNotificationService } from '@foundation/notification/testing';
import { TranslationService } from '@foundation/translations/services';
import { createMockTranslationService } from '@foundation/translations/services/testing';
import { TabManagerService } from '@foundation/utils';
import { createMockTabManagerService } from '@foundation/utils/testing';
import { ContributorsRepository } from './contributors.repository';

describe('ContributorsRepository', () => {
	let service: ContributorsRepository;
	let routerMock: { navigate: ReturnType<typeof vi.fn> };
	let requestServiceMock: ReturnType<typeof createMockRequestService> & { post$: ReturnType<typeof vi.fn> };

	beforeEach(() => {
		routerMock = { navigate: vi.fn() };
		requestServiceMock = {
			...createMockRequestService(),
			post$: vi.fn().mockReturnValue(of({ result: { inserted: 0, updated: 0, skipped: 0, errors: [] } })),
		};

		TestBed.configureTestingModule({
			providers: [
				ContributorsRepository,
				{ provide: Router, useValue: routerMock },
				{ provide: RequestService, useValue: requestServiceMock },
				{ provide: NotificationService, useValue: createMockNotificationService() },
				{ provide: TranslationService, useValue: createMockTranslationService() },
				{ provide: TabManagerService, useValue: createMockTabManagerService() },
			],
		});
		service = TestBed.inject(ContributorsRepository);
	});

	it('should be created', () => {
		expect(service).toBeTruthy();
	});

	it('should have the correct api_url', () => {
		expect(service.api_url).toBe('/api/edf/rand/contributors');
	});

	it('should have the correct kind', () => {
		expect(service.kind).toBe('contributors');
	});

	it('should have a store initialized', () => {
		expect(service.store).toBeDefined();
	});

	it('store should start with an empty objects list', () => {
		expect(service.store.objects$$$.value).toEqual([]);
	});

	describe('goToContributor', () => {
		it('should navigate to contributor builder when a contributorId is provided', () => {
			service.goToContributor('cont-42');
			expect(routerMock.navigate).toHaveBeenCalledWith(['/', 'host', 'dashboard', 'contributors', 'cont-42', 'builder']);
		});

		it('should navigate with null contributorId', () => {
			service.goToContributor(null);
			expect(routerMock.navigate).toHaveBeenCalledWith(['/', 'host', 'dashboard', 'contributors', null, 'builder']);
		});
	});

	describe('importFromFile$', () => {
		it('should POST to the import-from-file endpoint with fileId', () => {
			const result = { inserted: 2, updated: 1, skipped: 0, errors: [] };
			requestServiceMock.post$.mockReturnValue(of({ result }));

			let emitted: any;
			service.importFromFile$('file-abc').subscribe((res) => (emitted = res));

			expect(requestServiceMock.post$).toHaveBeenCalledWith(
				'/api/edf/rand/contributors/import-from-file',
				{ fileId: 'file-abc', onlyNames: undefined }
			);
			expect(emitted).toEqual({ result });
		});

		it('should include onlyNames when provided', () => {
			service.importFromFile$('file-abc', ['Alice', 'Bob']).subscribe();

			expect(requestServiceMock.post$).toHaveBeenCalledWith(
				'/api/edf/rand/contributors/import-from-file',
				{ fileId: 'file-abc', onlyNames: ['Alice', 'Bob'] }
			);
		});
	});

	describe('previewFromFile$', () => {
		it('should POST to the preview-from-file endpoint with fileId', () => {
			const rows = [{ name: 'Alice' }];
			requestServiceMock.post$.mockReturnValue(of({ result: rows }));

			let emitted: any;
			service.previewFromFile$('file-xyz').subscribe((res) => (emitted = res));

			expect(requestServiceMock.post$).toHaveBeenCalledWith(
				'/api/edf/rand/contributors/preview-from-file',
				{ fileId: 'file-xyz' }
			);
			expect(emitted).toEqual({ result: rows });
		});
	});

	describe('purgeAll$', () => {
		it('should POST to the purge endpoint', () => {
			const purgeResult = { deleted_contributors: 5, deleted_acls: 3 };
			requestServiceMock.post$.mockReturnValue(of({ result: purgeResult }));

			let emitted: any;
			service.purgeAll$().subscribe((res) => (emitted = res));

			expect(requestServiceMock.post$).toHaveBeenCalledWith(
				'/api/edf/rand/contributors/purge',
				{}
			);
			expect(emitted).toEqual({ result: purgeResult });
		});
	});
});
