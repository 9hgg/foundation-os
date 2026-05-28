import { DefaultTheme, Font } from './default.theme.quill';

describe('default.theme.quill', () => {
	describe('DefaultTheme', () => {
		it('is exported', () => {
			expect(DefaultTheme).toBeDefined();
		});
	});

	describe('Font', () => {
		it('is exported', () => {
			expect(Font).toBeDefined();
		});
	});
});
