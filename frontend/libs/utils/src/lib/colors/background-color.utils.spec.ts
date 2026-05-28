import { DEFAULT_BACKGROUND, DEFAULT_TEXT_COLOR, getInheritedBackgroundColor, getInheritedTextColor } from './background-color.utils';

describe('background-color.utils', () => {
	describe('DEFAULT_BACKGROUND', () => {
		it('is exported', () => {
			expect(DEFAULT_BACKGROUND).toBeDefined();
		});
	});

	describe('DEFAULT_TEXT_COLOR', () => {
		it('is exported', () => {
			expect(DEFAULT_TEXT_COLOR).toBeDefined();
		});
	});

	describe('getInheritedBackgroundColor', () => {
		it('is exported', () => {
			expect(getInheritedBackgroundColor).toBeDefined();
		});
	});

	describe('getInheritedTextColor', () => {
		it('is exported', () => {
			expect(getInheritedTextColor).toBeDefined();
		});
	});
});
