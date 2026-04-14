import { vi } from 'vitest';

/**
 * Creates a fresh mock for TranslationService.
 * `prep` returns a function that returns 'translated' when called.
 */
export function createMockTranslationService() {
	return {
		prep: vi.fn().mockReturnValue(() => 'translated'),
	};
}
