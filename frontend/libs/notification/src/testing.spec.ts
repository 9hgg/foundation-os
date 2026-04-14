import { createMockNotificationService } from './testing';

describe('createMockNotificationService', () => {
	it('should return an object with all notification methods', () => {
		const mock = createMockNotificationService();
		expect(mock.notify).toBeDefined();
		expect(mock.warning).toBeDefined();
		expect(mock.success).toBeDefined();
		expect(mock.error).toBeDefined();
		expect(mock.confirm).toBeDefined();
		expect(mock.prompt).toBeDefined();
		expect(mock.snack).toBeDefined();
		expect(mock.snackSuccess).toBeDefined();
		expect(mock.snackError).toBeDefined();
		expect(mock.snackWarning).toBeDefined();
	});

	it('all methods should be vi.fn()', () => {
		const mock = createMockNotificationService();
		const methods = ['notify', 'warning', 'success', 'error', 'snack', 'snackSuccess', 'snackError', 'snackWarning'] as const;
		for (const method of methods) {
			mock[method]('test');
			expect(mock[method]).toHaveBeenCalledWith('test');
		}
	});

	it('confirm should return an object with a closed BehaviorSubject', () => {
		const mock = createMockNotificationService();
		const result = mock.confirm('Are you sure?');
		expect(result).toBeDefined();
		expect(result.closed).toBeDefined();
	});

	it('confirm closed should emit false initially', () => {
		const mock = createMockNotificationService();
		const result = mock.confirm('Are you sure?');
		let emitted: boolean | undefined;
		result.closed.subscribe((v: boolean) => (emitted = v));
		expect(emitted).toBe(false);
	});

	it('prompt should return an object with a closed BehaviorSubject', () => {
		const mock = createMockNotificationService();
		const result = mock.prompt('Enter value');
		expect(result).toBeDefined();
		expect(result.closed).toBeDefined();
	});

	it('prompt closed should emit null initially', () => {
		const mock = createMockNotificationService();
		const result = mock.prompt('Enter value');
		let emitted: unknown = 'sentinel';
		result.closed.subscribe((v: unknown) => (emitted = v));
		expect(emitted).toBeNull();
	});

	it('each call to createMockNotificationService returns a fresh mock', () => {
		const mock1 = createMockNotificationService();
		const mock2 = createMockNotificationService();
		mock1.notify('Hello');
		expect(mock2.notify).not.toHaveBeenCalled();
	});

	it('should track calls to notify', () => {
		const mock = createMockNotificationService();
		mock.notify('msg', 'Title');
		expect(mock.notify).toHaveBeenCalledWith('msg', 'Title');
		expect(mock.notify).toHaveBeenCalledTimes(1);
	});
});
