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
import { CustomersRepository } from './customers.repository';

describe('CustomersRepository', () => {
	let service: CustomersRepository;
	let routerMock: { navigate: ReturnType<typeof vi.fn> };

	beforeEach(() => {
		routerMock = { navigate: vi.fn() };

		TestBed.configureTestingModule({
			providers: [
				CustomersRepository,
				{ provide: Router, useValue: routerMock },
				{ provide: RequestService, useValue: createMockRequestService() },
				{ provide: NotificationService, useValue: createMockNotificationService() },
				{ provide: TranslationService, useValue: createMockTranslationService() },
				{ provide: TabManagerService, useValue: createMockTabManagerService() },
			],
		});
		service = TestBed.inject(CustomersRepository);
	});

	it('should be created', () => {
		expect(service).toBeTruthy();
	});

	it('should have the correct api_url', () => {
		expect(service.api_url).toBe('/api/edf/rand/customers');
	});

	it('should have the correct kind', () => {
		expect(service.kind).toBe('customers');
	});

	it('should have a store initialized', () => {
		expect(service.store).toBeDefined();
	});

	it('store should start with an empty objects list', () => {
		expect(service.store.objects$$$.value).toEqual([]);
	});

	describe('goToCustomer', () => {
		it('should navigate to customer builder when a customerId is provided', () => {
			service.goToCustomer('cust-123');
			expect(routerMock.navigate).toHaveBeenCalledWith(['/', 'host', 'dashboard', 'customers', 'cust-123', 'builder']);
		});

		it('should navigate to customers list when customerId is null', () => {
			service.goToCustomer(null);
			expect(routerMock.navigate).toHaveBeenCalledWith(['/', 'host', 'dashboard', 'customers']);
		});

		it('should navigate to customers list when customerId is an empty string', () => {
			service.goToCustomer('');
			expect(routerMock.navigate).toHaveBeenCalledWith(['/', 'host', 'dashboard', 'customers']);
		});
	});
});
