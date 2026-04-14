import { vi } from 'vitest';
import { BehaviorSubject } from 'rxjs';

/**
 * Creates a fresh mock for NotificationService with all common methods stubbed.
 * `confirm` and `prompt` return an object with `closed` as a BehaviorSubject.
 */
export function createMockNotificationService() {
	return {
		notify: vi.fn(),
		warning: vi.fn(),
		success: vi.fn(),
		error: vi.fn(),
		confirm: vi.fn().mockReturnValue({ closed: new BehaviorSubject(false) }),
		prompt: vi.fn().mockReturnValue({ closed: new BehaviorSubject(null) }),
		snack: vi.fn(),
		snackSuccess: vi.fn(),
		snackError: vi.fn(),
		snackWarning: vi.fn(),
	};
}
