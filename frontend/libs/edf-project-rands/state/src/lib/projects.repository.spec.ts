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
import { ProjectsRepository } from './projects.repository';

describe('ProjectsRepository', () => {
	let service: ProjectsRepository;
	let routerMock: { navigate: ReturnType<typeof vi.fn> };

	beforeEach(() => {
		routerMock = { navigate: vi.fn() };

		TestBed.configureTestingModule({
			providers: [
				ProjectsRepository,
				{ provide: Router, useValue: routerMock },
				{ provide: RequestService, useValue: createMockRequestService() },
				{ provide: NotificationService, useValue: createMockNotificationService() },
				{ provide: TranslationService, useValue: createMockTranslationService() },
				{ provide: TabManagerService, useValue: createMockTabManagerService() },
			],
		});
		service = TestBed.inject(ProjectsRepository);
	});

	it('should be created', () => {
		expect(service).toBeTruthy();
	});

	it('should have the correct api_url', () => {
		expect(service.api_url).toBe('/api/edf/rand/projects');
	});

	it('should have the correct kind', () => {
		expect(service.kind).toBe('projects');
	});

	it('should have a store initialized', () => {
		expect(service.store).toBeDefined();
	});

	it('store should start with an empty objects list', () => {
		expect(service.store.objects$$$.value).toEqual([]);
	});

	describe('goToProject', () => {
		it('should navigate to project builder when a projectId is provided', () => {
			service.goToProject('proj-111');
			expect(routerMock.navigate).toHaveBeenCalledWith(['/', 'host', 'dashboard', 'projects', 'proj-111', 'builder'], {
				queryParams: undefined,
			});
		});

		it('should navigate with null projectId', () => {
			service.goToProject(null);
			expect(routerMock.navigate).toHaveBeenCalledWith(['/', 'host', 'dashboard', 'projects', null, 'builder'], {
				queryParams: undefined,
			});
		});
	});
});
