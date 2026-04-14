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
import { PurchasesRepository } from './purchases.repository';

describe('PurchasesRepository', () => {
	let service: PurchasesRepository;
	let routerMock: { navigate: ReturnType<typeof vi.fn> };

	beforeEach(() => {
		routerMock = { navigate: vi.fn() };

		TestBed.configureTestingModule({
			providers: [
				PurchasesRepository,
				{ provide: Router, useValue: routerMock },
				{ provide: RequestService, useValue: createMockRequestService() },
				{ provide: NotificationService, useValue: createMockNotificationService() },
				{ provide: TranslationService, useValue: createMockTranslationService() },
				{ provide: TabManagerService, useValue: createMockTabManagerService() },
			],
		});
		service = TestBed.inject(PurchasesRepository);
	});

	it('should be created', () => {
		expect(service).toBeTruthy();
	});

	it('should have the correct api_url', () => {
		expect(service.api_url).toBe('/api/edf/rand/purchases');
	});

	it('should have the correct kind', () => {
		expect(service.kind).toBe('purchases');
	});

	it('should have a store initialized', () => {
		expect(service.store).toBeDefined();
	});

	it('store should start with an empty objects list', () => {
		expect(service.store.objects$$$.value).toEqual([]);
	});

	describe('goToPurchase', () => {
		it('should navigate to purchase builder when a purchaseId is provided', () => {
			service.goToPurchase('pur-555');
			expect(routerMock.navigate).toHaveBeenCalledWith(['/', 'host', 'dashboard', 'purchases', 'pur-555', 'builder']);
		});

		it('should navigate with null purchaseId', () => {
			service.goToPurchase(null);
			expect(routerMock.navigate).toHaveBeenCalledWith(['/', 'host', 'dashboard', 'purchases', null, 'builder']);
		});
	});
});
