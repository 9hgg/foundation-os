import { describe, it, expect } from 'vitest';
import * as SUT from './blots.utils';

// blots.utils exports only the CallbackFunction type — it has no runtime
// values of its own, but the module must load cleanly.
describe('blots.utils', () => {
	it('module loads without errors', () => {
		expect(SUT).toBeDefined();
	});

	it('is an object (module namespace)', () => {
		expect(typeof SUT).toBe('object');
	});
});
