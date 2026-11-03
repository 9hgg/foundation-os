import { Injectable } from '@angular/core';

/** Same File System Access API pattern already used by spoken's rumblestudio export pages
 * and gadzapp's album builder: a picked FileSystemDirectoryHandle isn't JSON-serializable
 * (so localStorage can't hold it), so it's persisted in IndexedDB instead, keyed by caller. */
type DirectoryPickerWindow = Window & {
	showDirectoryPicker?: (options?: { mode?: 'read' | 'readwrite' }) => Promise<FileSystemDirectoryHandle>;
};
type PersistedDirectoryHandle = FileSystemDirectoryHandle & {
	queryPermission(options: { mode: 'read' | 'readwrite' }): Promise<PermissionState>;
	requestPermission(options: { mode: 'read' | 'readwrite' }): Promise<PermissionState>;
};

@Injectable({ providedIn: 'root' })
export class FileSystemAccessService {
	isSupported(): boolean {
		return typeof window !== 'undefined' && !!(window as DirectoryPickerWindow).showDirectoryPicker;
	}

	/** Opens the native folder picker. Returns null if the user cancelled it (not an error). */
	async pickDirectory(mode: 'read' | 'readwrite' = 'readwrite'): Promise<FileSystemDirectoryHandle | null> {
		const picker = (window as DirectoryPickerWindow).showDirectoryPicker;
		if (!picker) throw new Error('FileSystemAccessService: this browser does not support the File System Access API.');
		try {
			return await picker({ mode });
		} catch (error) {
			if ((error as DOMException).name === 'AbortError') return null;
			throw error;
		}
	}

	/** Re-checks (and silently re-requests, no picker re-open) permission on a remembered handle. */
	async ensurePermission(handle: FileSystemDirectoryHandle, mode: 'read' | 'readwrite' = 'readwrite'): Promise<boolean> {
		const persisted = handle as PersistedDirectoryHandle;
		const permission = await persisted.queryPermission({ mode });
		if (permission === 'granted') return true;
		if (permission === 'prompt') return (await persisted.requestPermission({ mode })) === 'granted';
		return false;
	}

	async rememberDirectory(databaseName: string, storeName: string, key: string, handle: FileSystemDirectoryHandle): Promise<void> {
		const database = await this._openDatabase(databaseName, storeName);
		await new Promise<void>((resolve, reject) => {
			const request = database.transaction(storeName, 'readwrite').objectStore(storeName).put(handle, key);
			request.onsuccess = () => resolve();
			request.onerror = () => reject(request.error);
		});
	}

	async forgetDirectory(databaseName: string, storeName: string, key: string): Promise<void> {
		const database = await this._openDatabase(databaseName, storeName);
		await new Promise<void>((resolve, reject) => {
			const request = database.transaction(storeName, 'readwrite').objectStore(storeName).delete(key);
			request.onsuccess = () => resolve();
			request.onerror = () => reject(request.error);
		});
	}

	async getRememberedDirectory(databaseName: string, storeName: string, key: string): Promise<FileSystemDirectoryHandle | null> {
		const database = await this._openDatabase(databaseName, storeName);
		return new Promise((resolve, reject) => {
			const request = database.transaction(storeName).objectStore(storeName).get(key);
			request.onsuccess = () => resolve((request.result as FileSystemDirectoryHandle | undefined) ?? null);
			request.onerror = () => reject(request.error);
		});
	}

	/** Writes a complete file in one call, creating nested folders in `path` as needed. */
	async writeFile(directoryHandle: FileSystemDirectoryHandle, path: string, contents: Blob | ArrayBuffer): Promise<void> {
		const { directory, name } = await this._resolveDirectory(directoryHandle, path, { create: true });
		const fileHandle = await directory.getFileHandle(name, { create: true });
		const writable = await fileHandle.createWritable();
		await writable.write(contents);
		await writable.close();
	}

	async fileExists(directoryHandle: FileSystemDirectoryHandle, path: string): Promise<boolean> {
		try {
			const { directory, name } = await this._resolveDirectory(directoryHandle, path, { create: false });
			await directory.getFileHandle(name);
			return true;
		} catch {
			return false;
		}
	}

	/** Opens a writable stream once, kept open across multiple `write()` calls without
	 * closing in between -- this is what lets a local backup receive the same chunk-by-chunk
	 * stream as a progressive upload, reconstructing a valid file as bytes arrive instead of
	 * only ever having a final-blob dump. Caller is responsible for calling `close()`. */
	async getAppendableWriter(directoryHandle: FileSystemDirectoryHandle, path: string): Promise<FileSystemWritableFileStream> {
		const { directory, name } = await this._resolveDirectory(directoryHandle, path, { create: true });
		const fileHandle = await directory.getFileHandle(name, { create: true });
		return fileHandle.createWritable();
	}

	private async _resolveDirectory(root: FileSystemDirectoryHandle, path: string, options: { create: boolean }): Promise<{ directory: FileSystemDirectoryHandle; name: string }> {
		const segments = path.split('/').filter(Boolean);
		const name = segments.pop();
		if (!name) throw new Error(`FileSystemAccessService: invalid path "${path}".`);

		let directory = root;
		for (const segment of segments) {
			directory = await directory.getDirectoryHandle(segment, { create: options.create });
		}
		return { directory, name };
	}

	private _openDatabase(databaseName: string, storeName: string): Promise<IDBDatabase> {
		return new Promise((resolve, reject) => {
			const request = indexedDB.open(databaseName, 1);
			request.onupgradeneeded = () => {
				if (!request.result.objectStoreNames.contains(storeName)) {
					request.result.createObjectStore(storeName);
				}
			};
			request.onsuccess = () => resolve(request.result);
			request.onerror = () => reject(request.error);
		});
	}
}
