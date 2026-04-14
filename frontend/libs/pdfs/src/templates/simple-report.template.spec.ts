import { SIMPLE_REPORT_TEMPLATE, DEFAULT_PDF_HEADER_TEMPLATE, DEFAULT_PDF_FOOTER_TEMPLATE } from './simple-report.template';

describe('PDF templates', () => {
  describe('SIMPLE_REPORT_TEMPLATE', () => {
    it('is a non-empty string', () => {
      expect(typeof SIMPLE_REPORT_TEMPLATE).toBe('string');
      expect(SIMPLE_REPORT_TEMPLATE.length).toBeGreaterThan(0);
    });

    it('contains HTML document structure', () => {
      expect(SIMPLE_REPORT_TEMPLATE).toContain('<!DOCTYPE html>');
      expect(SIMPLE_REPORT_TEMPLATE).toContain('<html');
      expect(SIMPLE_REPORT_TEMPLATE).toContain('</html>');
    });

    it('contains title placeholder', () => {
      expect(SIMPLE_REPORT_TEMPLATE).toContain('{{ title }}');
    });

    it('contains sections loop', () => {
      expect(SIMPLE_REPORT_TEMPLATE).toContain('sections');
    });

    it('contains footer placeholder', () => {
      expect(SIMPLE_REPORT_TEMPLATE).toContain('footer');
    });
  });

  describe('DEFAULT_PDF_HEADER_TEMPLATE', () => {
    it('is a non-empty string', () => {
      expect(typeof DEFAULT_PDF_HEADER_TEMPLATE).toBe('string');
      expect(DEFAULT_PDF_HEADER_TEMPLATE.trim().length).toBeGreaterThan(0);
    });

    it('contains title placeholder', () => {
      expect(DEFAULT_PDF_HEADER_TEMPLATE).toContain('{{ title }}');
    });
  });

  describe('DEFAULT_PDF_FOOTER_TEMPLATE', () => {
    it('is a non-empty string', () => {
      expect(typeof DEFAULT_PDF_FOOTER_TEMPLATE).toBe('string');
      expect(DEFAULT_PDF_FOOTER_TEMPLATE.trim().length).toBeGreaterThan(0);
    });

    it('contains page number placeholders', () => {
      expect(DEFAULT_PDF_FOOTER_TEMPLATE).toContain('pageNumber');
      expect(DEFAULT_PDF_FOOTER_TEMPLATE).toContain('totalPages');
    });
  });
});
