import { createMockTranslationService } from './testing';

describe('createMockTranslationService', () => {
	it('should return an object with a prep method', () => {
		const mock = createMockTranslationService();
		expect(mock.prep).toBeDefined();
		expect(typeof mock.prep).toBe('function');
	});

	it('prep should be a vi.fn()', () => {
		const mock = createMockTranslationService();
		mock.prep('Hello');
		expect(mock.prep).toHaveBeenCalledWith('Hello');
	});

	it('prep should return a function when called', () => {
		const mock = createMockTranslationService();
		const getter = mock.prep('Hello');
		expect(typeof getter).toBe('function');
	});

	it('the returned function should return "translated"', () => {
		const mock = createMockTranslationService();
		const getter = mock.prep('Hello');
		expect(getter()).toBe('translated');
	});

	it('each call to createMockTranslationService returns a fresh mock', () => {
		const mock1 = createMockTranslationService();
		const mock2 = createMockTranslationService();
		mock1.prep('Hello');
		expect(mock2.prep).not.toHaveBeenCalled();
	});

	it('should work with various input sentences', () => {
		const mock = createMockTranslationService();
		const inputs = ['Hello', 'Goodbye', 'Submit', 'Cancel', 'ERROR'];
		for (const input of inputs) {
			const getter = mock.prep(input);
			expect(getter()).toBe('translated');
		}
	});

	it('should accept optional arguments without error', () => {
		const mock = createMockTranslationService();
		expect(() => mock.prep('Hello', { name: 'Bob' }, true, 'context')).not.toThrow();
	});
});
