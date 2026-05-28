import { firstValueFrom } from 'rxjs';
import { createMockDragAndDropService, createMockPortalService, createMockTabManagerService } from './testing';

describe('createMockTabManagerService', () => {
        it('returns an object with a fixed tabId string', () => {
                const mock = createMockTabManagerService();
                expect(mock.tabId).toBe('test-tab-id-1234');
        });

        it('each call returns a distinct object (no shared reference)', () => {
                const a = createMockTabManagerService();
                const b = createMockTabManagerService();
                expect(a).not.toBe(b);
        });
});

describe('createMockDragAndDropService', () => {
        it('returns an object with all required method stubs', () => {
                const mock = createMockDragAndDropService();
                expect(typeof mock.enableDrag).toBe('function');
                expect(typeof mock.startDrag).toBe('function');
                expect(typeof mock.endDrag).toBe('function');
                expect(typeof mock.clear).toBe('function');
        });

        it('starts with data and dataKind as null', () => {
                const mock = createMockDragAndDropService();
                expect(mock.data).toBeNull();
                expect(mock.dataKind).toBeNull();
        });

        it('spy calls on one instance do not bleed into another', () => {
                const a = createMockDragAndDropService();
                const b = createMockDragAndDropService();
                a.enableDrag('x');
                expect(a.enableDrag).toHaveBeenCalledWith('x');
                expect(b.enableDrag).not.toHaveBeenCalled();
        });

        it('startDrag records its call arguments', () => {
                const mock = createMockDragAndDropService();
                mock.startDrag('item', 'task');
                expect(mock.startDrag).toHaveBeenCalledWith('item', 'task');
        });

        it('endDrag and clear are callable without arguments', () => {
                const mock = createMockDragAndDropService();
                mock.endDrag();
                mock.clear();
                expect(mock.endDrag).toHaveBeenCalledOnce();
                expect(mock.clear).toHaveBeenCalledOnce();
        });
});

describe('createMockPortalService', () => {
        it('getPortal$$$ is a vi.fn()', () => {
                const mock = createMockPortalService();
                expect(typeof mock.getPortal$$$).toBe('function');
        });

        it('getPortal$$$ returns an object with a $ observable', async () => {
                const mock = createMockPortalService();
                const result = mock.getPortal$$$('some-key');
                expect(result).toHaveProperty('$');
        });

        it('the $ observable emits null synchronously', async () => {
                const mock = createMockPortalService();
                const result = mock.getPortal$$$('key');
                const value = await firstValueFrom(result.$);
                expect(value).toBeNull();
        });

        it('getPortal$$$ records its call argument', () => {
                const mock = createMockPortalService();
                mock.getPortal$$$('portal-key');
                expect(mock.getPortal$$$).toHaveBeenCalledWith('portal-key');
	});
});
