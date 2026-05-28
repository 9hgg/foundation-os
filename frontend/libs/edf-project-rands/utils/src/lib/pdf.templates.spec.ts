import { ACTIVITY_TEMPLATE, DELIVERABLE_TEMPLATE, PDF_FOOTER_TEMPLATE, PDF_HEADER_TEMPLATE, PROJECT_TEMPLATE, PROJECT_TEMPLATE_OLD } from './pdf.templates';

describe('pdf.templates', () => {
	describe('ACTIVITY_TEMPLATE', () => {
		it('is exported', () => {
			expect(ACTIVITY_TEMPLATE).toBeDefined();
		});
	});

	describe('DELIVERABLE_TEMPLATE', () => {
		it('is exported', () => {
			expect(DELIVERABLE_TEMPLATE).toBeDefined();
		});
	});

	describe('PDF_FOOTER_TEMPLATE', () => {
		it('is exported', () => {
			expect(PDF_FOOTER_TEMPLATE).toBeDefined();
		});
	});

	describe('PDF_HEADER_TEMPLATE', () => {
		it('is exported', () => {
			expect(PDF_HEADER_TEMPLATE).toBeDefined();
		});
	});

	describe('PROJECT_TEMPLATE', () => {
		it('is exported', () => {
			expect(PROJECT_TEMPLATE).toBeDefined();
		});
	});

	describe('PROJECT_TEMPLATE_OLD', () => {
		it('is exported', () => {
			expect(PROJECT_TEMPLATE_OLD).toBeDefined();
		});
	});
});
