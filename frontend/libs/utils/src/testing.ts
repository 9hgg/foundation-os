import { vi } from 'vitest';
import { of } from 'rxjs';

/**
 * Creates a fresh mock for TabManagerService.
 */
export function createMockTabManagerService() {
	return {
		tabId: 'test-tab-id-1234',
	};
}

/**
 * Creates a fresh mock for DragAndDropService.
 */
export function createMockDragAndDropService() {
	return {
		enableDrag: vi.fn(),
		startDrag: vi.fn(),
		endDrag: vi.fn(),
		clear: vi.fn(),
		data: null as unknown,
		dataKind: null as string | null,
	};
}

/**
 * Creates a fresh mock for PortalService.
 */
export function createMockPortalService() {
	return {
		getPortal$$$: vi.fn().mockReturnValue({ $: of(null) }),
	};
}
