import { TestBed } from '@angular/core/testing';
import { NotificationService } from '@foundation/notification';
import { PortalService } from '@foundation/utils';
import { GoToBlockComponent } from './goto-block.component';

const notificationMock = { snack: vi.fn(), snackSuccess: vi.fn(), snackError: vi.fn() };
const portalServiceMock = { updatePortal: vi.fn(), getPortal$$$: vi.fn() };

describe('GoToBlockComponent', () => {
	let component: GoToBlockComponent;

	beforeEach(() => {
		vi.clearAllMocks();
		TestBed.configureTestingModule({
			imports: [GoToBlockComponent],
			providers: [
				{ provide: NotificationService, useValue: notificationMock },
				{ provide: PortalService, useValue: portalServiceMock },
			],
		});
		const fixture = TestBed.createComponent(GoToBlockComponent);
		component = fixture.componentInstance;
		fixture.detectChanges();
	});

	it('should be created', () => {
		expect(component).toBeTruthy();
	});

	it('should have default signal values', () => {
		expect(component.targetType()).toBe('next');
		expect(component.customTarget()).toBe('');
		expect(component.buttonText()).toBe('Navigate');
		expect(component.backgroundColor()).toBe('#4f46e5');
		expect(component.textColor()).toBe('#ffffff');
		expect(component.borderRadius()).toBe(6);
	});

	it('goToTarget() does nothing when canvasManager is null', () => {
		expect(() => component.goToTarget()).not.toThrow();
	});

	describe('goToTarget()', () => {
		let canvasManagerMock: any;

		beforeEach(() => {
			canvasManagerMock = {
				goToNextCanvas: vi.fn(),
				goToPreviousCanvas: vi.fn(),
				selectCanvasById: vi.fn(),
				canvasesAsArray: [{ id: 'c1' }, { id: 'c2' }],
			};
			component.canvasManager = canvasManagerMock;
		});

		it('calls goToNextCanvas for "next" targetType', () => {
			component.targetType.set('next');
			component.goToTarget();
			expect(canvasManagerMock.goToNextCanvas).toHaveBeenCalled();
		});

		it('calls goToPreviousCanvas for "prev" targetType', () => {
			component.targetType.set('prev');
			component.goToTarget();
			expect(canvasManagerMock.goToPreviousCanvas).toHaveBeenCalled();
		});

		it('calls selectCanvasById with first canvas for "beginning"', () => {
			component.targetType.set('beginning');
			component.goToTarget();
			expect(canvasManagerMock.selectCanvasById).toHaveBeenCalledWith('c1');
		});

		it('calls selectCanvasById with customTarget for "custom"', () => {
			component.targetType.set('custom');
			component.customTarget.set('my-canvas-id');
			component.goToTarget();
			expect(canvasManagerMock.selectCanvasById).toHaveBeenCalledWith('my-canvas-id');
		});

		it('uses targetCanvasId as fallback for "custom"', () => {
			component.targetType.set('custom');
			component.customTarget.set('');
			component.targetCanvasId = 'fallback-id';
			component.goToTarget();
			expect(canvasManagerMock.selectCanvasById).toHaveBeenCalledWith('fallback-id');
		});
	});

	describe('getButtonText()', () => {
		it('returns "Next" for next', () => {
			component.targetType.set('next');
			expect(component.getButtonText()).toBe('Next');
		});

		it('returns "Previous" for prev', () => {
			component.targetType.set('prev');
			expect(component.getButtonText()).toBe('Previous');
		});

		it('returns "Go to Beginning" for beginning', () => {
			component.targetType.set('beginning');
			expect(component.getButtonText()).toBe('Go to Beginning');
		});

		it('returns "Go to {id}" for custom with target', () => {
			component.targetType.set('custom');
			component.customTarget.set('my-page');
			expect(component.getButtonText()).toBe('Go to my-page');
		});

		it('returns "Go to Page" for custom without target', () => {
			component.targetType.set('custom');
			component.customTarget.set('');
			expect(component.getButtonText()).toBe('Go to Page');
		});
	});
});
