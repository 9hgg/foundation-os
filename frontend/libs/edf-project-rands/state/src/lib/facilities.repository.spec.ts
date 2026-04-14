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
import { FacilitiesRepository } from './facilities.repository';

describe('FacilitiesRepository', () => {
	let service: FacilitiesRepository;
	let routerMock: { navigate: ReturnType<typeof vi.fn> };

	beforeEach(() => {
		routerMock = { navigate: vi.fn() };

		TestBed.configureTestingModule({
			providers: [
				FacilitiesRepository,
				{ provide: Router, useValue: routerMock },
				{ provide: RequestService, useValue: createMockRequestService() },
				{ provide: NotificationService, useValue: createMockNotificationService() },
				{ provide: TranslationService, useValue: createMockTranslationService() },
				{ provide: TabManagerService, useValue: createMockTabManagerService() },
			],
		});
		service = TestBed.inject(FacilitiesRepository);
	});

	it('should be created', () => {
		expect(service).toBeTruthy();
	});

	it('should have the correct api_url', () => {
		expect(service.api_url).toBe('/api/edf/rand/facilities');
	});

	it('should have the correct kind', () => {
		expect(service.kind).toBe('edf-project-rand/facilities');
	});

	it('should have a store initialized', () => {
		expect(service.store).toBeDefined();
	});

	it('store should start with an empty objects list', () => {
		expect(service.store.objects$$$.value).toEqual([]);
	});

	describe('goToFacility', () => {
		it('should navigate to facility builder when a facilityId is provided', () => {
			service.goToFacility('fac-456');
			expect(routerMock.navigate).toHaveBeenCalledWith(['/', 'host', 'dashboard', 'facilities', 'fac-456', 'builder']);
		});

		it('should navigate with null facilityId', () => {
			service.goToFacility(null);
			expect(routerMock.navigate).toHaveBeenCalledWith(['/', 'host', 'dashboard', 'facilities', null, 'builder']);
		});
	});
});
