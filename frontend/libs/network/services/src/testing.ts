import { vi } from 'vitest';
import { BehaviorSubject, of } from 'rxjs';

/**
 * Creates a fresh mock for RequestService with all common methods stubbed.
 * Each call returns a new object with new vi.fn() instances.
 */
export function createMockRequestService() {
	return {
		get$: vi.fn().mockReturnValue(of({ result: { data: [], total: 0 } })),
		post$: vi.fn().mockReturnValue(of({ result: { data: [] } })),
		put$: vi.fn().mockReturnValue(of({ result: { data: {} } })),
		delete$: vi.fn().mockReturnValue(of({ result: {} })),
		getBasic$: vi.fn().mockReturnValue(of({ result: { data: [] } })),
		getObject$: vi.fn().mockReturnValue(of({ result: { data: {} } })),
		getObjectList$: vi.fn().mockReturnValue(of({ result: { data: [], total: 0 } })),
		putObject$: vi.fn().mockReturnValue(of({ result: { data: {} } })),
		patchObject$: vi.fn().mockReturnValue(of({ result: { data: {} } })),
		deleteObject$: vi.fn().mockReturnValue(of({ result: {} })),
		clearCache$: new BehaviorSubject(null),
		clearCache: vi.fn(),
	};
}
