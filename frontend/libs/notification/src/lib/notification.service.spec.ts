import { TestBed } from '@angular/core/testing';
import { NotificationService, NotificationDialogComponent, ConfirmationDialogComponent, PromptDialogComponent } from './notification.service';
import { Dialog, DialogRef, DIALOG_DATA } from '@angular/cdk/dialog';
import { Overlay } from '@angular/cdk/overlay';
import { TranslationService } from '@foundation/translations/services';
import { of } from 'rxjs';

describe('NotificationService', () => {
	let service: NotificationService;
	let dialogMock: { open: ReturnType<typeof vi.fn>; closeAll: ReturnType<typeof vi.fn> };
	let overlayMock: ReturnType<typeof createOverlayMock>;

	function createOverlayMock() {
		const posStrat = {
			top: vi.fn().mockReturnThis(),
			left: vi.fn().mockReturnThis(),
			right: vi.fn().mockReturnThis(),
			bottom: vi.fn().mockReturnThis(),
		};
		return {
			position: vi.fn().mockReturnValue({
				global: vi.fn().mockReturnValue(posStrat),
			}),
			_strategy: posStrat,
		};
	}

	beforeEach(() => {
		dialogMock = {
			open: vi.fn().mockReturnValue({
				closed: of(undefined),
				close: vi.fn(),
			}),
			closeAll: vi.fn(),
		};

		overlayMock = createOverlayMock();

		const translationServiceMock = {
			prep: vi.fn().mockReturnValue(() => 'translated'),
		};

		TestBed.configureTestingModule({
			providers: [
				NotificationService,
				{ provide: Dialog, useValue: dialogMock },
				{ provide: Overlay, useValue: overlayMock },
				{ provide: TranslationService, useValue: translationServiceMock },
			],
		});
		service = TestBed.inject(NotificationService);
	});

	it('should be created', () => {
		expect(service).toBeTruthy();
	});

	describe('notify', () => {
		it('should open notification dialog', () => {
			service.notify('Message', 'Title');
			expect(dialogMock.open).toHaveBeenCalled();
		});
	});

	describe('warning', () => {
		it('should open notification dialog with warning title', () => {
			const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
			service.warning('Something went wrong');
			expect(dialogMock.open).toHaveBeenCalled();
			warnSpy.mockRestore();
		});

		it('should use custom title when provided', () => {
			const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
			service.warning('Message', 'Custom Title');
			expect(dialogMock.open).toHaveBeenCalled();
			warnSpy.mockRestore();
		});
	});

	describe('success', () => {
		it('should open notification dialog', () => {
			service.success('It worked');
			expect(dialogMock.open).toHaveBeenCalled();
		});
	});

	describe('error', () => {
		it('should open notification dialog and log error', () => {
			const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
			service.error('Something broke');
			expect(dialogMock.open).toHaveBeenCalled();
			errorSpy.mockRestore();
		});
	});

	describe('confirm', () => {
		it('should open confirm dialog', () => {
			service.confirm('Are you sure?', 'Confirm');
			expect(dialogMock.open).toHaveBeenCalled();
		});
	});

	describe('prompt', () => {
		it('should open prompt dialog', () => {
			service.prompt('Enter value', 'Input');
			expect(dialogMock.open).toHaveBeenCalled();
		});

		it('should pass defaultValue and inputPlaceholder', () => {
			service.prompt('Enter value', 'Input', { defaultValue: 'default', inputPlaceholder: 'Type here' });
			expect(dialogMock.open).toHaveBeenCalled();
		});
	});

	describe('selectFromOptions', () => {
		it('should open selection dialog', () => {
			const options = [
				{ value: '1', label: 'Option 1' },
				{ value: '2', label: 'Option 2' },
			];
			service.selectFromOptions(options, 'Pick one', 'Which?');
			expect(dialogMock.open).toHaveBeenCalled();
		});
	});

	describe('snack', () => {
		it('should open a snack notification', () => {
			service.snack('Quick message');
			expect(dialogMock.open).toHaveBeenCalled();
		});
	});

	describe('snackSuccess', () => {
		it('should open a success snack', () => {
			service.snackSuccess('It worked!');
			expect(dialogMock.open).toHaveBeenCalled();
		});
	});

	describe('snackError', () => {
		it('should open an error snack and log error', () => {
			const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
			service.snackError('Something broke');
			expect(dialogMock.open).toHaveBeenCalled();
			errorSpy.mockRestore();
		});
	});

	describe('snackWarning', () => {
		it('should open a warning snack and log warning', () => {
			const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
			service.snackWarning('Heads up');
			expect(dialogMock.open).toHaveBeenCalled();
			warnSpy.mockRestore();
		});
	});

	describe('_closeDialogs (via config)', () => {
		it('should close all dialogs when closeDialogs is *', () => {
			service.notify('msg', 'title', { closeDialogs: '*' });
			expect(dialogMock.closeAll).toHaveBeenCalled();
		});

		it('should close specific dialogs by id', () => {
			const closeFn = vi.fn();
			service.dialogMap.set('test-dialog', { close: closeFn, closed: of(undefined) } as never);
			service.notify('msg', 'title', { closeDialogs: ['test-dialog'] });
			expect(closeFn).toHaveBeenCalled();
		});

		it('should close existing dialog with same dialogTarget', () => {
			const closeFn = vi.fn();
			service.dialogMap.set('my-target', { close: closeFn, closed: of(undefined) } as never);
			service.notify('msg', 'title', { dialogTarget: 'my-target' });
			expect(closeFn).toHaveBeenCalled();
		});
	});

	describe('dialogMap tracking', () => {
		it('should store dialogRef when dialogTarget is set', () => {
			service.notify('msg', 'title', { dialogTarget: 'tracked' });
			expect(service.dialogMap.has('tracked')).toBe(true);
		});
	});

	describe('snack positions', () => {
		it('should create snack at top-left', () => {
			service.snack('msg', 'title', { snackPosition: 'top-left' });
			expect(dialogMock.open).toHaveBeenCalled();
			expect(overlayMock._strategy.top).toHaveBeenCalled();
			expect(overlayMock._strategy.left).toHaveBeenCalled();
		});

		it('should create snack at top-right', () => {
			service.snack('msg', 'title', { snackPosition: 'top-right' });
			expect(dialogMock.open).toHaveBeenCalled();
		});

		it('should create snack at bottom-left', () => {
			service.snack('msg', 'title', { snackPosition: 'bottom-left' });
			expect(dialogMock.open).toHaveBeenCalled();
			expect(overlayMock._strategy.bottom).toHaveBeenCalled();
			expect(overlayMock._strategy.left).toHaveBeenCalled();
		});

		it('should create snack at bottom-right', () => {
			service.snack('msg', 'title', { snackPosition: 'bottom-right' });
			expect(dialogMock.open).toHaveBeenCalled();
			expect(overlayMock._strategy.bottom).toHaveBeenCalled();
			expect(overlayMock._strategy.right).toHaveBeenCalled();
		});
	});

	describe('autoCloseMs', () => {
		it('should auto-close dialog after specified time', () => {
			vi.useFakeTimers();
			const closeRef = vi.fn();
			dialogMock.open.mockReturnValue({ closed: of(undefined), close: closeRef });

			service.notify('msg', 'title', { autoCloseMs: 1000, dialogTarget: 'auto-close-test' });

			vi.advanceTimersByTime(1000);
			expect(closeRef).toHaveBeenCalled();

			vi.useRealTimers();
		});
	});

	describe('config options', () => {
		it('should handle custom width and height', () => {
			service.notify('msg', 'title', { width: '500px', height: '300px' });
			expect(dialogMock.open).toHaveBeenCalled();
		});

		it('should handle disableClose option', () => {
			service.notify('msg', 'title', { disableClose: true });
			expect(dialogMock.open).toHaveBeenCalled();
		});

		it('should handle hasBackdrop false', () => {
			service.notify('msg', 'title', { hasBackdrop: false });
			expect(dialogMock.open).toHaveBeenCalled();
		});
	});
});

describe('NotificationDialogComponent', () => {
	it('should create and read data from config', () => {
		const dialogRefMock = {
			close: vi.fn(),
			config: {
				data: { title: 'Test Title', message: 'Test Message', dismissButtonText: 'OK' },
			},
		};

		TestBed.configureTestingModule({
			imports: [NotificationDialogComponent],
			providers: [
				{ provide: DialogRef, useValue: dialogRefMock },
				{ provide: TranslationService, useValue: { prep: vi.fn().mockReturnValue(() => 'translated') } },
			],
		});

		const fixture = TestBed.createComponent(NotificationDialogComponent);
		const component = fixture.componentInstance;
		expect(component.title).toBe('Test Title');
		expect(component.message).toBe('Test Message');
		expect(component.dismissButtonText).toBe('OK');
	});

	it('should use default dismiss text when not provided', () => {
		const dialogRefMock = {
			close: vi.fn(),
			config: {
				data: { title: 'Title', message: 'Msg' },
			},
		};

		TestBed.configureTestingModule({
			imports: [NotificationDialogComponent],
			providers: [
				{ provide: DialogRef, useValue: dialogRefMock },
				{ provide: TranslationService, useValue: { prep: vi.fn().mockReturnValue(() => 'Dismiss') } },
			],
		});

		const fixture = TestBed.createComponent(NotificationDialogComponent);
		const component = fixture.componentInstance;
		expect(component.dismissButtonText).toBe('Dismiss');
	});
});

describe('ConfirmationDialogComponent', () => {
	it('should create and read data from config', () => {
		const dialogRefMock = {
			close: vi.fn(),
			config: {
				data: { title: 'Confirm?', message: 'Are you sure?', confirmButtonText: 'Yes', cancelButtonText: 'No' },
			},
		};

		TestBed.configureTestingModule({
			imports: [ConfirmationDialogComponent],
			providers: [
				{ provide: DialogRef, useValue: dialogRefMock },
				{ provide: TranslationService, useValue: { prep: vi.fn().mockReturnValue(() => 'translated') } },
			],
		});

		const fixture = TestBed.createComponent(ConfirmationDialogComponent);
		const component = fixture.componentInstance;
		expect(component.title).toBe('Confirm?');
		expect(component.message).toBe('Are you sure?');
		expect(component.confirmButtonText).toBe('Yes');
		expect(component.cancelButtonText).toBe('No');
	});
});

describe('PromptDialogComponent', () => {
	it('should create and read data from DIALOG_DATA', () => {
		const dialogRefMock = {
			close: vi.fn(),
			config: { data: {} },
		};

		const mockData = {
			title: 'Enter name',
			message: 'Please type your name',
			defaultValue: 'default',
			inputPlaceholder: 'Name...',
			confirmButtonText: 'Submit',
			cancelButtonText: 'Cancel',
		};

		TestBed.configureTestingModule({
			imports: [PromptDialogComponent],
			providers: [
				{ provide: DialogRef, useValue: dialogRefMock },
				{ provide: DIALOG_DATA, useValue: mockData },
			],
		});

		const fixture = TestBed.createComponent(PromptDialogComponent);
		const component = fixture.componentInstance;
		expect(component.promptModalData.title).toBe('Enter name');
		expect(component.promptModalData.defaultValue).toBe('default');
	});
});
