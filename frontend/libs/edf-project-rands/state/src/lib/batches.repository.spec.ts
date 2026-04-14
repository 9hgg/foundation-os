import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { RequestService } from '@foundation/network/services';
import { createMockRequestService } from '@foundation/network/services/testing';
import { NotificationService } from '@foundation/notification';
import { createMockNotificationService } from '@foundation/notification/testing';
import { TranslationService } from '@foundation/translations/services';
import { createMockTranslationService } from '@foundation/translations/services/testing';
import { TabManagerService } from '@foundation/utils';
import { createMockTabManagerService } from '@foundation/utils/testing';
import { BatchesRepository } from './batches.repository';

describe('BatchesRepository', () => {
	let service: BatchesRepository;
	let routerMock: { navigate: ReturnType<typeof vi.fn> };

	beforeEach(() => {
		routerMock = { navigate: vi.fn() };

		TestBed.configureTestingModule({
			providers: [
				BatchesRepository,
				{ provide: Router, useValue: routerMock },
				{ provide: RequestService, useValue: createMockRequestService() },
				{ provide: NotificationService, useValue: createMockNotificationService() },
				{ provide: TranslationService, useValue: createMockTranslationService() },
				{ provide: TabManagerService, useValue: createMockTabManagerService() },
			],
		});
		service = TestBed.inject(BatchesRepository);
	});

	it('should be created', () => {
		expect(service).toBeTruthy();
	});

	it('should have the correct api_url', () => {
		expect(service.api_url).toBe('/api/edf/rand/batches');
	});

	it('should have the correct kind', () => {
		expect(service.kind).toBe('batches');
	});

	it('should have a store initialized', () => {
		expect(service.store).toBeDefined();
	});

	it('store should start with an empty objects list', () => {
		expect(service.store.objects$$$.value).toEqual([]);
	});

	describe('goToBatch', () => {
		it('should navigate to batch builder when a batchId is provided', () => {
			service.goToBatch('batch-789');
			expect(routerMock.navigate).toHaveBeenCalledWith(['/', 'host', 'dashboard', 'batches', 'batch-789', 'builder']);
		});

		it('should navigate with null batchId', () => {
			service.goToBatch(null);
			expect(routerMock.navigate).toHaveBeenCalledWith(['/', 'host', 'dashboard', 'batches', null, 'builder']);
		});
	});
});
