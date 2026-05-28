import { isWebview } from './webview.utils';

describe('webview.utils', () => {
	describe('isWebview', () => {
		it('is exported', () => {
			expect(isWebview).toBeDefined();
		});
	});
});
