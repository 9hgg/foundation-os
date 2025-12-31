import { Injectable } from '@angular/core';

const DEBUG = false;

@Injectable({
	providedIn: 'root',
})
export class CacheService {
	private cache = new Map<string, { data: any; expiry: number }>();

	get(key: string): any {
		const cached = this.cache.get(key);
		if (!cached) {
			return null;
		}

		const now = Date.now();
		if (now > cached.expiry) {
			this.cache.delete(key);
			return null;
		}

		console.log(`Cache hit for key: ${key}. Data: ${cached.data}. Expires in: ${Math.round((cached.expiry - now) / 1000)}s`);

		return cached.data;
	}

	set(key: string, data: any, durationMs: number): void {
		if (DEBUG) console.log(`Caching data for key: ${key}. Expires in: ${durationMs / 1000}s`);

		const expiry = Date.now() + durationMs;
		this.cache.set(key, { data, expiry });
	}
}
