import { TestBed } from '@angular/core/testing';
import { NotificationService } from '@foundation/notification';
import { PortalService } from '@foundation/utils';
import { NextBlockComponent } from './next-block.component';

const notificationMock = { snack: vi.fn(), snackSuccess: vi.fn(), snackError: vi.fn() };
const portalServiceMock = { updatePortal: vi.fn(), getPortal$$$: vi.fn() };

describe('NextBlockComponent', () => {
	let component: NextBlockComponent;

	beforeEach(() => {
		vi.clearAllMocks();
		TestBed.configureTestingModule({
			imports: [NextBlockComponent],
			providers: [
				{ provide: NotificationService, useValue: notificationMock },
				{ provide: PortalService, useValue: portalServiceMock },
			],
		});
		const fixture = TestBed.createComponent(NextBlockComponent);
		component = fixture.componentInstance;
		fixture.detectChanges();
	});

	it('should be created', () => {
		expect(component).toBeTruthy();
	});

	it('should have default signal values', () => {
		expect(component.buttonText()).toBe('Next');
		expect(component.backgroundColor()).toBe('#2563eb');
		expect(component.textColor()).toBe('#ffffff');
		expect(component.borderRadius()).toBe(6);
	});

	it('next() does nothing when canvasManager is null', () => {
		expect(() => component.next()).not.toThrow();
	});

	it('next() calls canvasManager.goToNextCanvas()', () => {
		const canvasManagerMock = { goToNextCanvas: vi.fn() };
		component.canvasManager = canvasManagerMock as any;
		component.next();
		expect(canvasManagerMock.goToNextCanvas).toHaveBeenCalled();
	});

	it('buttonText can be updated', () => {
		component.buttonText.set('Continue');
		expect(component.buttonText()).toBe('Continue');
	});
});
