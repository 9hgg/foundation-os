import { TestBed } from '@angular/core/testing';
import { TranslationService } from '@foundation/translations/services';
import { firstValueFrom, of } from 'rxjs';
import { ClipboardService } from './clipboard.service';
import { NotificationService } from './notification.service';

describe('ClipboardService', () => {
	let service: ClipboardService;
	let notificationService: {
		snackSuccess: ReturnType<typeof vi.fn>;
		promptTextarea: ReturnType<typeof vi.fn>;
	};

	beforeEach(() => {
		notificationService = {
			snackSuccess: vi.fn(),
			promptTextarea: vi.fn().mockReturnValue({ closed: of(undefined) }),
		};
		TestBed.configureTestingModule({
			providers: [ClipboardService, { provide: NotificationService, useValue: notificationService }, { provide: TranslationService, useValue: { prep: (value: string) => () => value } }],
		});
		service = TestBed.inject(ClipboardService);
	});

	afterEach(() => vi.restoreAllMocks());

	function setSecureContext(value: boolean) {
		Object.defineProperty(window, 'isSecureContext', { configurable: true, value });
	}

	it('copies with the Clipboard API and reports success', async () => {
		const writeText = vi.fn().mockResolvedValue(undefined);
		setSecureContext(true);
		Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });

		await expect(firstValueFrom(service.copy('hello'))).resolves.toBe(true);
		expect(writeText).toHaveBeenCalledWith('hello');
		expect(notificationService.snackSuccess).toHaveBeenCalledWith('Copied to clipboard');
	});

	it('can copy without showing a success snack', async () => {
		setSecureContext(true);
		Object.defineProperty(navigator, 'clipboard', {
			configurable: true,
			value: { writeText: vi.fn().mockResolvedValue(undefined) },
		});

		await expect(firstValueFrom(service.copy('quiet', { showSuccessSnack: false }))).resolves.toBe(true);
		expect(notificationService.snackSuccess).not.toHaveBeenCalled();
	});

	it('falls back to execCommand when the Clipboard API rejects', async () => {
		setSecureContext(true);
		Object.defineProperty(navigator, 'clipboard', {
			configurable: true,
			value: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
		});
		const execCommand = vi.fn().mockReturnValue(true);
		Object.defineProperty(document, 'execCommand', { configurable: true, value: execCommand });

		await expect(firstValueFrom(service.copy('legacy'))).resolves.toBe(true);
		expect(execCommand).toHaveBeenCalledWith('copy');
		expect(document.querySelector('textarea')).toBeNull();
	});

	it('opens a manual-copy dialog when automatic copy is unavailable', async () => {
		setSecureContext(false);
		Object.defineProperty(document, 'execCommand', { configurable: true, value: vi.fn().mockReturnValue(false) });

		await expect(firstValueFrom(service.copy('line 1\nline 2\nline 3\nline 4'))).resolves.toBe(false);
		expect(notificationService.promptTextarea).toHaveBeenCalledWith('Automatic copy is not available here. Select the text below and copy it (Ctrl/Cmd+C).', 'Copy manually', { defaultValue: 'line 1\nline 2\nline 3\nline 4', rows: 4, confirmButtonText: 'Done' });
	});
});
