import { TestBed } from '@angular/core/testing';
import { NotificationService } from '@foundation/notification';
import { PortalService } from '@foundation/utils';
import { GoToBeginningBlockComponent } from './goto-beginning-block.component';

const notificationMock = { snack: vi.fn(), snackSuccess: vi.fn(), snackError: vi.fn() };
const portalServiceMock = { updatePortal: vi.fn(), getPortal$$$: vi.fn() };

describe('GoToBeginningBlockComponent', () => {
	let component: GoToBeginningBlockComponent;

	beforeEach(() => {
		vi.clearAllMocks();
		TestBed.configureTestingModule({
			imports: [GoToBeginningBlockComponent],
			providers: [
				{ provide: NotificationService, useValue: notificationMock },
				{ provide: PortalService, useValue: portalServiceMock },
			],
		});
		const fixture = TestBed.createComponent(GoToBeginningBlockComponent);
		component = fixture.componentInstance;
		fixture.detectChanges();
	});

	it('should be created', () => {
		expect(component).toBeTruthy();
	});

	it('should have default signal values', () => {
		expect(component.buttonText()).toBe('Go to Beginning');
		expect(component.backgroundColor()).toBe('#16a34a');
		expect(component.textColor()).toBe('#ffffff');
		expect(component.borderRadius()).toBe(6);
	});

	it('goToBeginning() does nothing when canvasManager is null', () => {
		expect(() => component.goToBeginning()).not.toThrow();
	});

	it('goToBeginning() navigates to first canvas', () => {
		const canvasManagerMock = {
			canvasesAsArray: [{ id: 'first-canvas' }, { id: 'second-canvas' }],
			selectCanvasById: vi.fn(),
		};
		component.canvasManager = canvasManagerMock as any;
		component.goToBeginning();
		expect(canvasManagerMock.selectCanvasById).toHaveBeenCalledWith('first-canvas');
	});

	it('goToBeginning() does nothing with empty canvas list', () => {
		const canvasManagerMock = {
			canvasesAsArray: [],
			selectCanvasById: vi.fn(),
		};
		component.canvasManager = canvasManagerMock as any;
		component.goToBeginning();
		expect(canvasManagerMock.selectCanvasById).not.toHaveBeenCalled();
	});
});
