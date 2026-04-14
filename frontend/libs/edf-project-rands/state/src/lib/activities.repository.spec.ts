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
import { ActivitiesRepository } from './activities.repository';

describe('ActivitiesRepository', () => {
	let service: ActivitiesRepository;
	let routerMock: { navigate: ReturnType<typeof vi.fn> };

	beforeEach(() => {
		routerMock = { navigate: vi.fn() };

		TestBed.configureTestingModule({
			providers: [
				ActivitiesRepository,
				{ provide: Router, useValue: routerMock },
				{ provide: RequestService, useValue: createMockRequestService() },
				{ provide: NotificationService, useValue: createMockNotificationService() },
				{ provide: TranslationService, useValue: createMockTranslationService() },
				{ provide: TabManagerService, useValue: createMockTabManagerService() },
			],
		});
		service = TestBed.inject(ActivitiesRepository);
	});

	it('should be created', () => {
		expect(service).toBeTruthy();
	});

	it('should have the correct api_url', () => {
		expect(service.api_url).toBe('/api/edf/rand/activities');
	});

	it('should have the correct kind', () => {
		expect(service.kind).toBe('activities');
	});

	it('should have a store initialized', () => {
		expect(service.store).toBeDefined();
	});

	it('store should start with an empty objects list', () => {
		expect(service.store.objects$$$.value).toEqual([]);
	});

	describe('goToActivity', () => {
		it('should navigate to activity builder when an activityId is provided', () => {
			service.goToActivity('act-001');
			expect(routerMock.navigate).toHaveBeenCalledWith(['/', 'host', 'dashboard', 'activities', 'act-001', 'builder'], {
				queryParams: undefined,
			});
		});

		it('should navigate with null activityId', () => {
			service.goToActivity(null);
			expect(routerMock.navigate).toHaveBeenCalledWith(['/', 'host', 'dashboard', 'activities', null, 'builder'], {
				queryParams: undefined,
			});
		});
	});
});
