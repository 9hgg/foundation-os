import { OctetHumanReadablePipe } from './octet-humand-readable.pipe';

describe('OctetHumanReadablePipe', () => {
	let pipe: OctetHumanReadablePipe;

	beforeEach(() => {
		pipe = new OctetHumanReadablePipe();
	});

	it('returns "0 B" for 0', () => {
		expect(pipe.transform(0)).toBe('0 B');
	});

	it('formats bytes', () => {
		expect(pipe.transform(500)).toBe('500 B');
	});

	it('formats kilobytes', () => {
		expect(pipe.transform(1024)).toBe('1 KB');
	});

	it('formats megabytes', () => {
		expect(pipe.transform(1024 * 1024)).toBe('1 MB');
	});

	it('formats gigabytes', () => {
		expect(pipe.transform(1024 * 1024 * 1024)).toBe('1 GB');
	});

	it('formats a plan-sized allowance', () => {
		expect(pipe.transform(500 * 1024 * 1024 * 1024)).toBe('500 GB');
	});

	it('formats with decimal precision', () => {
		expect(pipe.transform(1536)).toBe('1.5 KB');
	});

	it('treats null-ish input as zero rather than NaN', () => {
		expect(pipe.transform(undefined as unknown as number)).toBe('0 B');
	});
});
