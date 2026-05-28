import { CacheInterceptor, InterceptorSkipCacheHeader } from './cache.interceptor';

describe('cache.interceptor', () => {
	describe('CacheInterceptor', () => {
		it('is exported', () => {
			expect(CacheInterceptor).toBeDefined();
		});
	});

	describe('InterceptorSkipCacheHeader', () => {
		it('is exported', () => {
			expect(InterceptorSkipCacheHeader).toBeDefined();
		});
	});
});
