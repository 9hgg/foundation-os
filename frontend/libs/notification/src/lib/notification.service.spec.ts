import { TestBed } from '@angular/core/testing';
import {
	NotificationService,
	NotificationDialogComponent,
	ConfirmationDialogComponent,
	PromptDialogComponent,
	PromptTextareaDialogComponent,
	PromptQuillTextareaDialogComponent,
	SelectionDialogComponent,
	SnackNotificationComponent,
} from './notification.service';
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

	describe('promptTextarea', () => {
		it('should open the textarea prompt dialog with defaults and overrides', () => {
			service.promptTextarea('Body', 'Title', { rows: 8, defaultValue: 'seed' });
			expect(dialogMock.open).toHaveBeenCalled();
			const [component, config] = dialogMock.open.mock.calls[0];
			expect(component).toBeDefined();
			expect(config.data).toMatchObject({ message: 'Body', title: 'Title', rows: 8, defaultValue: 'seed' });
		});
	});

	describe('promptQuillTextarea', () => {
		it('should open the quill prompt dialog', () => {
			service.promptQuillTextarea('Body', 'Title', { defaultValue: '<p>hi</p>' });
			expect(dialogMock.open).toHaveBeenCalled();
			const [, config] = dialogMock.open.mock.calls[0];
			expect(config.data).toMatchObject({ message: 'Body', title: 'Title', defaultValue: '<p>hi</p>' });
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

	it('renders a link in the message, target and all -- the ToS line depends on it', () => {
		const dialogRefMock = {
			close: vi.fn(),
			config: {
				data: {
					title: 'Confirm subscription',
					message: 'By confirming you also accept the <a href="/terms-of-service" target="_blank" class="link">Terms of Service</a>.',
				},
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
		fixture.detectChanges();

		const link: HTMLAnchorElement | null = fixture.nativeElement.querySelector('a');
		expect(link).toBeTruthy();
		expect(link?.getAttribute('href')).toBe('/terms-of-service');
		// Angular's [innerHTML] sanitizer must keep target, or the purchase flow gets navigated away.
		expect(link?.getAttribute('target')).toBe('_blank');
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

describe('PromptTextareaDialogComponent', () => {
	function mount(data: Record<string, unknown>) {
		const dialogRefMock = { close: vi.fn() };
		TestBed.configureTestingModule({
			imports: [PromptTextareaDialogComponent],
			providers: [
				{ provide: DialogRef, useValue: dialogRefMock },
				{ provide: DIALOG_DATA, useValue: data },
			],
		});
		const fixture = TestBed.createComponent(PromptTextareaDialogComponent);
		fixture.detectChanges();
		return { fixture, component: fixture.componentInstance, dialogRefMock };
	}

	it('reads its data from DIALOG_DATA', () => {
		const { component } = mount({ title: 'Paste', message: 'Long text', defaultValue: 'seed', rows: 8 });
		expect(component.promptTextareaModalData.title).toBe('Paste');
		expect(component.promptTextareaModalData.rows).toBe(8);
	});

	it('confirms with the textarea value', () => {
		const { fixture, dialogRefMock } = mount({ title: 'Paste' });
		const textarea: HTMLTextAreaElement = fixture.nativeElement.querySelector('textarea');
		textarea.value = 'typed value';
		const confirmButton: HTMLButtonElement = fixture.nativeElement.querySelectorAll('button')[1];
		confirmButton.click();
		expect(dialogRefMock.close).toHaveBeenCalledWith({ value: 'typed value' });
	});

	it('cancels with null', () => {
		const { fixture, dialogRefMock } = mount({ title: 'Paste' });
		const cancelButton: HTMLButtonElement = fixture.nativeElement.querySelectorAll('button')[0];
		cancelButton.click();
		expect(dialogRefMock.close).toHaveBeenCalledWith(null);
	});
});

describe('SelectionDialogComponent', () => {
	function mount(data: Record<string, unknown>) {
		const dialogRefMock = { close: vi.fn() };
		TestBed.configureTestingModule({
			imports: [SelectionDialogComponent],
			providers: [
				{ provide: DialogRef, useValue: dialogRefMock },
				{ provide: DIALOG_DATA, useValue: data },
			],
		});
		const fixture = TestBed.createComponent(SelectionDialogComponent);
		fixture.detectChanges();
		return { fixture, component: fixture.componentInstance, dialogRefMock };
	}

	const options = [
		{ value: 'a', label: 'Option A' },
		{ value: 'b', label: 'Option B', disabled: true },
	];

	it('seeds the initially selected value', () => {
		const { component } = mount({ options, selectedValue: 'a' });
		expect(component.selectedValue).toBe('a');
	});

	it('selects an enabled option', () => {
		const { component } = mount({ options });
		component.selectOption('a');
		expect(component.selectedValue).toBe('a');
	});

	it('refuses to select a disabled option', () => {
		const { component } = mount({ options });
		component.selectOption('b');
		expect(component.selectedValue).toBeUndefined();
	});

	it('reports the selected option as disabled once it is chosen directly', () => {
		const { component } = mount({ options, selectedValue: 'b' });
		expect(component.isSelectedOptionDisabled()).toBe(true);
	});

	it('reports no disabled selection when nothing is selected', () => {
		const { component } = mount({ options });
		expect(component.isSelectedOptionDisabled()).toBe(false);
	});

	it('confirms with the selected value', () => {
		const { fixture, dialogRefMock } = mount({ options });
		const optionRow: HTMLElement = fixture.nativeElement.querySelector('[data-testid="selection-option-a"]');
		optionRow.click();
		fixture.detectChanges();
		const confirmButton: HTMLButtonElement = fixture.nativeElement.querySelector('[data-testid="selection-confirm"]');
		confirmButton.click();
		expect(dialogRefMock.close).toHaveBeenCalledWith({ value: 'a' });
	});

	it('cancels with null', () => {
		const { fixture, dialogRefMock } = mount({ options });
		const cancelButton: HTMLButtonElement = fixture.nativeElement.querySelector('[data-testid="selection-cancel"]');
		cancelButton.click();
		expect(dialogRefMock.close).toHaveBeenCalledWith(null);
	});
});

describe('SnackNotificationComponent', () => {
	function mount(data: Record<string, unknown>, autoCloseMs?: number) {
		const dialogRefMock = {
			close: vi.fn(),
			config: { data, autoCloseMs },
		};
		TestBed.resetTestingModule();
		TestBed.configureTestingModule({
			imports: [SnackNotificationComponent],
			providers: [{ provide: DialogRef, useValue: dialogRefMock }],
		});
		const fixture = TestBed.createComponent(SnackNotificationComponent);
		fixture.detectChanges();
		return { fixture, component: fixture.componentInstance, dialogRefMock };
	}

	it('defaults to the info variant classes', () => {
		const { component } = mount({ title: 't', message: 'm' });
		expect(component.variant).toBe('info');
		expect(component.iconWrapperClass).toContain('text-info');
	});

	it('picks classes for the success/warning/error variants', () => {
		expect(mount({ variant: 'success' }).component.iconWrapperClass).toContain('text-success');
		expect(mount({ variant: 'warning' }).component.iconWrapperClass).toContain('text-warning');
		expect(mount({ variant: 'error' }).component.iconWrapperClass).toContain('text-error');
	});

	it('shows no progress bar without a positive finite autoCloseMs', () => {
		expect(mount({}).component.showProgressBar()).toBe(false);
		expect(mount({}, 0).component.showProgressBar()).toBe(false);
		expect(mount({}, Infinity).component.showProgressBar()).toBe(false);
	});

	it('starts the progress bar and fills it to 100% when autoCloseMs is set', () => {
		vi.useFakeTimers();
		const { component } = mount({}, 1000);
		expect(component.showProgressBar()).toBe(true);
		expect(component.progressPercentage()).toBe(0);
		vi.advanceTimersByTime(50);
		expect(component.progressPercentage()).toBe(100);
		vi.useRealTimers();
	});

	it('pauses on hover and resumes afterwards', () => {
		vi.useFakeTimers();
		const { component } = mount({}, 1000);
		vi.advanceTimersByTime(50);
		vi.advanceTimersByTime(400);

		component.onHover(true);
		expect(component.progressTransitionDuration()).toBe(0);
		const pausedPercentage = component.progressPercentage();
		expect(pausedPercentage).toBeGreaterThan(0);

		component.onHover(false);
		vi.advanceTimersByTime(50);
		expect(component.progressPercentage()).toBe(100);
		vi.useRealTimers();
	});

	it('runs the action callback and closes the dialog', () => {
		const callback = vi.fn();
		const { component, dialogRefMock } = mount({ action: { label: 'Undo', callback } });
		component.runAction();
		expect(callback).toHaveBeenCalled();
		expect(dialogRefMock.close).toHaveBeenCalled();
	});

	it('closes the dialog from the dismiss button', () => {
		const { fixture, dialogRefMock } = mount({ title: 't', message: 'm' });
		const dismissButton: HTMLButtonElement = fixture.nativeElement.querySelector('button');
		dismissButton.click();
		expect(dialogRefMock.close).toHaveBeenCalled();
	});
});

describe('PromptQuillTextareaDialogComponent', () => {
	function mount(data: Record<string, unknown>) {
		const dialogRefMock = { close: vi.fn() };
		TestBed.configureTestingModule({
			imports: [PromptQuillTextareaDialogComponent],
			providers: [
				{ provide: DialogRef, useValue: dialogRefMock },
				{ provide: DIALOG_DATA, useValue: data },
			],
		});
		const fixture = TestBed.createComponent(PromptQuillTextareaDialogComponent);
		fixture.detectChanges();
		return { fixture, component: fixture.componentInstance, dialogRefMock };
	}

	it('seeds the editor with the default value', () => {
		const { component } = mount({ title: 'Edit', defaultValue: '<p>hi</p>' });
		expect(component.editorValue()).toBe('<p>hi</p>');
	});

	it('starts empty without a default value', () => {
		const { component } = mount({ title: 'Edit' });
		expect(component.editorValue()).toBe('');
	});

	it('tracks quill text-change events into editorValue', () => {
		const { component } = mount({ title: 'Edit' });
		// eslint-disable-next-line @typescript-eslint/no-explicit-any -- reaching into the private quill instance the component mounted for itself
		const quillInstance = (component as any)._quillInstance;
		expect(quillInstance).toBeTruthy();
		vi.spyOn(quillInstance, 'getSemanticHTML').mockReturnValue('<p>typed</p>');
		quillInstance.emitter.emit('text-change');
		expect(component.editorValue()).toBe('<p>typed</p>');
	});

	it('confirms with the current editor value', () => {
		const { fixture, dialogRefMock } = mount({ title: 'Edit', defaultValue: '<p>hi</p>' });
		// Quill mounts its own toolbar buttons ahead of ours, so scope to the footer actions row.
		const confirmButton: HTMLButtonElement = fixture.nativeElement.querySelectorAll('div.border-t button')[1];
		confirmButton.click();
		expect(dialogRefMock.close).toHaveBeenCalledWith({ value: '<p>hi</p>' });
	});

	it('cancels with null', () => {
		const { fixture, dialogRefMock } = mount({ title: 'Edit' });
		const cancelButton: HTMLButtonElement = fixture.nativeElement.querySelectorAll('div.border-t button')[0];
		cancelButton.click();
		expect(dialogRefMock.close).toHaveBeenCalledWith(null);
	});

	it('detaches the text-change listener on destroy', () => {
		const { fixture, component } = mount({ title: 'Edit' });
		// eslint-disable-next-line @typescript-eslint/no-explicit-any -- same private-instance access as above, to prove teardown really happens
		const quillInstance = (component as any)._quillInstance;
		const offSpy = vi.spyOn(quillInstance, 'off');
		fixture.destroy();
		expect(offSpy).toHaveBeenCalledWith('text-change', expect.any(Function));
		expect((component as any)._quillInstance).toBeNull();
	});
});
