import { ACTIVITY_TEMPLATE, DELIVERABLE_TEMPLATE, PDF_FOOTER_TEMPLATE, PDF_HEADER_TEMPLATE, PROJECT_TEMPLATE, PROJECT_TEMPLATE_OLD } from './pdf.templates';

// These are static Jinja/HTML strings assembled from smaller fragments -- there is no runtime
// logic to exercise (no functions, no branches), so the meaningful thing to test is that each
// exported document keeps the structural sections it promises, and that the compositions differ
// from one another the way their names imply.

describe('pdf.templates', () => {
	describe('PROJECT_TEMPLATE', () => {
		it('assembles the cover, table of contents, sections, batches, deliverables and annexes', () => {
			expect(PROJECT_TEMPLATE).toContain('<section class="cover">');
			expect(PROJECT_TEMPLATE).toContain('id="sommaire"');
			expect(PROJECT_TEMPLATE).toContain('id="content"');
			expect(PROJECT_TEMPLATE).toContain('id="lots-activites"');
			expect(PROJECT_TEMPLATE).toContain('id="delivrables"');
			expect(PROJECT_TEMPLATE).toContain('id="annexes"');
		});

		it('is a full HTML document with the shared base styles inlined', () => {
			expect(PROJECT_TEMPLATE).toMatch(/^<!DOCTYPE html>/);
			expect(PROJECT_TEMPLATE).toContain('<html lang="fr">');
			expect(PROJECT_TEMPLATE).toContain('font-family: -apple-system');
		});
	});

	describe('PROJECT_TEMPLATE_OLD', () => {
		it('keeps the cover/toc/sections/batches/deliverables but drops the annexes section', () => {
			expect(PROJECT_TEMPLATE_OLD).toContain('id="sommaire"');
			expect(PROJECT_TEMPLATE_OLD).toContain('id="lots-activites"');
			expect(PROJECT_TEMPLATE_OLD).toContain('id="delivrables"');
			expect(PROJECT_TEMPLATE_OLD).not.toContain('id="annexes"');
		});
	});

	describe('DELIVERABLE_TEMPLATE', () => {
		it('has the cover and sections but no table of contents or batches, and does have deliverables', () => {
			expect(DELIVERABLE_TEMPLATE).toContain('<section class="cover">');
			expect(DELIVERABLE_TEMPLATE).toContain('id="content"');
			expect(DELIVERABLE_TEMPLATE).toContain('id="delivrables"');
			expect(DELIVERABLE_TEMPLATE).not.toContain('id="sommaire"');
			expect(DELIVERABLE_TEMPLATE).not.toContain('id="lots-activites"');
		});
	});

	describe('ACTIVITY_TEMPLATE', () => {
		it('wraps a single conditional activity card between the sections and the deliverables', () => {
			expect(ACTIVITY_TEMPLATE).toContain('{% if activity %}');
			expect(ACTIVITY_TEMPLATE).toContain('class="activity avoid-break"');
			expect(ACTIVITY_TEMPLATE).toContain('id="delivrables"');
			expect(ACTIVITY_TEMPLATE).not.toContain('id="sommaire"');
			expect(ACTIVITY_TEMPLATE).not.toContain('id="lots-activites"');
		});
	});

	describe('PDF_HEADER_TEMPLATE', () => {
		it('is a small centered title band', () => {
			expect(PDF_HEADER_TEMPLATE).toContain('{{ title }}');
			expect(PDF_HEADER_TEMPLATE).toContain('justify-content:center');
		});
	});

	describe('PDF_FOOTER_TEMPLATE', () => {
		it('carries accessibility text, the page counter and the EDF copyright line', () => {
			expect(PDF_FOOTER_TEMPLATE).toContain('{{ footerAccessibility }}');
			expect(PDF_FOOTER_TEMPLATE).toContain('pageNumber');
			expect(PDF_FOOTER_TEMPLATE).toContain('totalPages');
			expect(PDF_FOOTER_TEMPLATE).toContain('© EDF');
			expect(PDF_FOOTER_TEMPLATE).toContain('{{ footerDate }}');
		});
	});
});
