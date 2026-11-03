import { FileSystemAccessService } from './file-system-access.service';

/** jsdom doesn't implement IndexedDB. This is a minimal in-memory fake covering exactly the
 * open/onupgradeneeded + transaction/objectStore/put/get/delete surface the service uses. */
class FakeIDBRequest<T> {
	result: T | undefined;
	error: Error | null = null;
	onsuccess: (() => void) | null = null;
	onerror: (() => void) | null = null;

	_succeed(result: T) {
		this.result = result;
		queueMicrotask(() => this.onsuccess?.());
	}
	_fail(error: Error) {
		this.error = error;
		queueMicrotask(() => this.onerror?.());
	}
}

class FakeObjectStore {
	constructor(private _data: Map<string, unknown>) {}
	put(value: unknown, key: string) {
		const request = new FakeIDBRequest<undefined>();
		this._data.set(key, value);
		request._succeed(undefined);
		return request;
	}
	get(key: string) {
		const request = new FakeIDBRequest<unknown>();
		request._succeed(this._data.get(key));
		return request;
	}
	delete(key: string) {
		const request = new FakeIDBRequest<undefined>();
		this._data.delete(key);
		request._succeed(undefined);
		return request;
	}
}

class FakeIDBDatabase {
	objectStoreNames = { contains: (name: string) => this._stores.has(name) };
	private _stores = new Map<string, Map<string, unknown>>();

	createObjectStore(name: string) {
		this._stores.set(name, new Map());
	}
	transaction(storeName: string) {
		if (!this._stores.has(storeName)) this._stores.set(storeName, new Map());
		const store = this._stores.get(storeName) ?? new Map();
		return { objectStore: () => new FakeObjectStore(store) };
	}
}

function installFakeIndexedDb() {
	const databases = new Map<string, FakeIDBDatabase>();
	(globalThis as unknown as { indexedDB: unknown }).indexedDB = {
		open: (name: string) => {
			const request = new FakeIDBRequest<FakeIDBDatabase>();
			const isNew = !databases.has(name);
			const database = databases.get(name) ?? new FakeIDBDatabase();
			databases.set(name, database);
			// mimic IDBOpenDBRequest: onupgradeneeded fires (with .result already set) before onsuccess
			queueMicrotask(() => {
				request.result = database;
				if (isNew) (request as unknown as { onupgradeneeded?: () => void }).onupgradeneeded?.();
				request.onsuccess?.();
			});
			return request;
		},
	};
}

describe('FileSystemAccessService', () => {
	let service: FileSystemAccessService;

	beforeEach(() => {
		installFakeIndexedDb();
		service = new FileSystemAccessService();
	});

	it('isSupported reflects whether showDirectoryPicker exists on window', () => {
		expect(service.isSupported()).toBe(false);

		(window as unknown as { showDirectoryPicker: () => void }).showDirectoryPicker = () => undefined;
		expect(service.isSupported()).toBe(true);
		delete (window as unknown as { showDirectoryPicker?: () => void }).showDirectoryPicker;
	});

	it('pickDirectory throws when the API is unsupported', async () => {
		await expect(service.pickDirectory()).rejects.toThrow();
	});

	it('pickDirectory returns null (not an error) when the user cancels', async () => {
		(window as unknown as { showDirectoryPicker: () => Promise<never> }).showDirectoryPicker = () => Promise.reject(Object.assign(new Error('cancelled'), { name: 'AbortError' }));

		const result = await service.pickDirectory();

		expect(result).toBeNull();
		delete (window as unknown as { showDirectoryPicker?: () => void }).showDirectoryPicker;
	});

	it('ensurePermission returns true immediately if already granted, without re-requesting', async () => {
		const handle = { queryPermission: vi.fn(() => Promise.resolve('granted')), requestPermission: vi.fn() } as unknown as FileSystemDirectoryHandle;

		const granted = await service.ensurePermission(handle);

		expect(granted).toBe(true);
		expect((handle as unknown as { requestPermission: ReturnType<typeof vi.fn> }).requestPermission).not.toHaveBeenCalled();
	});

	it('ensurePermission silently re-requests when state is "prompt"', async () => {
		const handle = { queryPermission: vi.fn(() => Promise.resolve('prompt')), requestPermission: vi.fn(() => Promise.resolve('granted')) } as unknown as FileSystemDirectoryHandle;

		const granted = await service.ensurePermission(handle);

		expect(granted).toBe(true);
		expect((handle as unknown as { requestPermission: ReturnType<typeof vi.fn> }).requestPermission).toHaveBeenCalledWith({ mode: 'readwrite' });
	});

	it('ensurePermission returns false when denied', async () => {
		const handle = { queryPermission: vi.fn(() => Promise.resolve('denied')), requestPermission: vi.fn() } as unknown as FileSystemDirectoryHandle;

		expect(await service.ensurePermission(handle)).toBe(false);
	});

	it('remembers and retrieves a directory handle across calls, scoped by key', async () => {
		const handleA = { name: 'folder-a' } as unknown as FileSystemDirectoryHandle;
		const handleB = { name: 'folder-b' } as unknown as FileSystemDirectoryHandle;

		await service.rememberDirectory('db', 'store', 'live-1', handleA);
		await service.rememberDirectory('db', 'store', 'live-2', handleB);

		expect(await service.getRememberedDirectory('db', 'store', 'live-1')).toBe(handleA);
		expect(await service.getRememberedDirectory('db', 'store', 'live-2')).toBe(handleB);
	});

	it('getRememberedDirectory returns null when nothing was stored for that key', async () => {
		expect(await service.getRememberedDirectory('db', 'store', 'unknown')).toBeNull();
	});

	it('forgetDirectory removes a remembered handle', async () => {
		const handle = { name: 'folder' } as unknown as FileSystemDirectoryHandle;
		await service.rememberDirectory('db', 'store', 'live-1', handle);

		await service.forgetDirectory('db', 'store', 'live-1');

		expect(await service.getRememberedDirectory('db', 'store', 'live-1')).toBeNull();
	});

	it('writeFile creates the file and writes+closes the stream', async () => {
		const write = vi.fn();
		const close = vi.fn();
		const fileHandle = { createWritable: vi.fn(() => Promise.resolve({ write, close })) };
		const directoryHandle = { getFileHandle: vi.fn(() => Promise.resolve(fileHandle)) } as unknown as FileSystemDirectoryHandle;

		await service.writeFile(directoryHandle, 'recording.webm', new Blob(['data']));

		expect(directoryHandle.getFileHandle).toHaveBeenCalledWith('recording.webm', { create: true });
		expect(write).toHaveBeenCalled();
		expect(close).toHaveBeenCalled();
	});

	it('writeFile creates nested folders along the given path', async () => {
		const write = vi.fn();
		const close = vi.fn();
		const fileHandle = { createWritable: vi.fn(() => Promise.resolve({ write, close })) };
		const deepestDirectory = { getFileHandle: vi.fn(() => Promise.resolve(fileHandle)) };
		const nestedDirectory = { getDirectoryHandle: vi.fn(() => Promise.resolve(deepestDirectory)) };
		const rootDirectory = { getDirectoryHandle: vi.fn(() => Promise.resolve(nestedDirectory)) } as unknown as FileSystemDirectoryHandle;

		await service.writeFile(rootDirectory, 'lives/live-1/recording.webm', new Blob(['data']));

		expect(rootDirectory.getDirectoryHandle).toHaveBeenCalledWith('lives', { create: true });
		expect(nestedDirectory.getDirectoryHandle).toHaveBeenCalledWith('live-1', { create: true });
	});

	it('fileExists returns true when the file handle resolves, false otherwise', async () => {
		const directoryHandle = { getFileHandle: vi.fn(() => Promise.resolve({})) } as unknown as FileSystemDirectoryHandle;
		expect(await service.fileExists(directoryHandle, 'present.webm')).toBe(true);

		const missingDirectoryHandle = { getFileHandle: vi.fn(() => Promise.reject(new Error('not found'))) } as unknown as FileSystemDirectoryHandle;
		expect(await service.fileExists(missingDirectoryHandle, 'missing.webm')).toBe(false);
	});

	it('getAppendableWriter opens a stream without closing it, so the caller can write multiple times', async () => {
		const createWritable = vi.fn(() => Promise.resolve({ write: vi.fn(), close: vi.fn() }));
		const fileHandle = { createWritable };
		const directoryHandle = { getFileHandle: vi.fn(() => Promise.resolve(fileHandle)) } as unknown as FileSystemDirectoryHandle;

		const writer = await service.getAppendableWriter(directoryHandle, 'recording.webm');

		expect(directoryHandle.getFileHandle).toHaveBeenCalledWith('recording.webm', { create: true });
		expect(createWritable).toHaveBeenCalledTimes(1);
		expect(writer).toBeDefined();
	});
});
