import { TestBed } from '@angular/core/testing';
import { NotificationService } from '@foundation/notification';
import { PortalService } from '@foundation/utils';
import { PreviousBlockComponent } from './previous-block.component';

const notificationMock = { snack: vi.fn(), snackSuccess: vi.fn(), snackError: vi.fn() };
const portalServiceMock = { updatePortal: vi.fn(), getPortal$$$: vi.fn() };

describe('PreviousBlockComponent', () => {
	let component: PreviousBlockComponent;

	beforeEach(() => {
		vi.clearAllMocks();
		TestBed.configureTestingModule({
			imports: [PreviousBlockComponent],
			providers: [
				{ provide: NotificationService, useValue: notificationMock },
				{ provide: PortalService, useValue: portalServiceMock },
			],
		});
		const fixture = TestBed.createComponent(PreviousBlockComponent);
		component = fixture.componentInstance;
		fixture.detectChanges();
	});

	it('should be created', () => {
		expect(component).toBeTruthy();
	});

	it('should have default signal values', () => {
		expect(component.buttonText()).toBe('Previous');
		expect(component.backgroundColor()).toBe('#4b5563');
		expect(component.textColor()).toBe('#ffffff');
		expect(component.borderRadius()).toBe(6);
	});

	it('previous() does nothing when canvasManager is null', () => {
		expect(() => component.previous()).not.toThrow();
	});

	it('previous() calls canvasManager.goToPreviousCanvas()', () => {
		const canvasManagerMock = { goToPreviousCanvas: vi.fn() };
		component.canvasManager = canvasManagerMock as any;
		component.previous();
		expect(canvasManagerMock.goToPreviousCanvas).toHaveBeenCalled();
	});
});
