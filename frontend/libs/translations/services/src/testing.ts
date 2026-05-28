import { vi } from 'vitest';
import { of } from 'rxjs';

/**
 * Creates a fresh mock for TranslationService.
 * `prep` returns a function that returns 'translated' when called.
 */
export function createMockTranslationService() {
	return {
		prep: vi.fn().mockReturnValue(() => 'translated'),
		translate$: vi.fn(({ inputSentence }: { inputSentence: string }) => of(inputSentence)),
	};
}
