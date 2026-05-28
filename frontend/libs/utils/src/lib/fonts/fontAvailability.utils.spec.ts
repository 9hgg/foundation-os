import { checkLocalStylesheetsForMissingFonts } from './fontAvailability.utils';

describe('fontAvailability.utils', () => {
	describe('checkLocalStylesheetsForMissingFonts', () => {
		it('is exported', () => {
			expect(checkLocalStylesheetsForMissingFonts).toBeDefined();
		});
	});
});
