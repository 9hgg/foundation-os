import { getContrastingColor, getRGBValues } from './color-contrast.utils';

describe('color-contrast.utils', () => {
	describe('getContrastingColor', () => {
		it('is exported', () => {
			expect(getContrastingColor).toBeDefined();
		});
	});

	describe('getRGBValues', () => {
		it('is exported', () => {
			expect(getRGBValues).toBeDefined();
		});
	});
});
