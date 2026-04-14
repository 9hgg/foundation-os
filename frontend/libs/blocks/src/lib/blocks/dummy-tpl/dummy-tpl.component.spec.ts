import { TestBed } from '@angular/core/testing';
import { NotificationService } from '@foundation/notification';
import { PortalService } from '@foundation/utils';
import { DummyTplComponent } from './dummy-tpl.component';

const notificationMock = { snack: vi.fn(), snackSuccess: vi.fn(), snackError: vi.fn() };
const portalServiceMock = { updatePortal: vi.fn(), getPortal$$$: vi.fn() };

describe('DummyTplComponent', () => {
	let component: DummyTplComponent;

	beforeEach(() => {
		vi.clearAllMocks();
		TestBed.configureTestingModule({
			imports: [DummyTplComponent],
			providers: [
				{ provide: NotificationService, useValue: notificationMock },
				{ provide: PortalService, useValue: portalServiceMock },
			],
		});
		const fixture = TestBed.createComponent(DummyTplComponent);
		component = fixture.componentInstance;
		fixture.detectChanges();
	});

	it('should be created', () => {
		expect(component).toBeTruthy();
	});

	it('counter starts at 0', () => {
		expect(component.counter()).toBe(0);
	});

	it('increment increases counter by 1', () => {
		component.increment();
		expect(component.counter()).toBe(1);
	});

	it('increment can be called multiple times', () => {
		component.increment();
		component.increment();
		component.increment();
		expect(component.counter()).toBe(3);
	});
});
