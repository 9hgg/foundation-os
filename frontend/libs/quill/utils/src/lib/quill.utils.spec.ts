import { describe, it, expect, beforeEach } from 'vitest';
import { extractSemanticAndContent } from './quill.utils';

// ---------------------------------------------------------------------------
// Minimal Quill stub — only the surface used by extractSemanticAndContent
// ---------------------------------------------------------------------------
function makeQuillStub(innerHTML: string, delta: object) {
	const root = document.createElement('div');
	root.innerHTML = innerHTML;

	return {
		root,
		getContents: () => delta,
	} as any;
}

describe('extractSemanticAndContent', () => {
	it('returns semanticHTML and content', () => {
		const quill = makeQuillStub('<p>Hello</p>', { ops: [] });
		const result = extractSemanticAndContent(quill);
		expect(result).toHaveProperty('semanticHTML');
		expect(result).toHaveProperty('content');
	});

	it('content equals the delta returned by getContents()', () => {
		const delta = { ops: [{ insert: 'Hello' }] };
		const quill = makeQuillStub('<p>Hello</p>', delta);
		const { content } = extractSemanticAndContent(quill);
		expect(content).toBe(delta);
	});

	it('removes .resize-handle elements from semanticHTML', () => {
		const html = '<p>text<span class="resize-handle"></span></p>';
		const quill = makeQuillStub(html, { ops: [] });
		const { semanticHTML } = extractSemanticAndContent(quill);
		expect(semanticHTML).not.toContain('resize-handle');
	});

	it('preserves non-handle elements in semanticHTML', () => {
		const html = '<p>Hello <strong>world</strong></p>';
		const quill = makeQuillStub(html, { ops: [] });
		const { semanticHTML } = extractSemanticAndContent(quill);
		expect(semanticHTML).toContain('<strong>world</strong>');
	});

	it('removes multiple resize handles in one pass', () => {
		const html =
			'<span class="resize-handle"></span>' +
			'<p>text</p>' +
			'<span class="resize-handle"></span>';
		const quill = makeQuillStub(html, { ops: [] });
		const { semanticHTML } = extractSemanticAndContent(quill);
		expect(semanticHTML).not.toContain('resize-handle');
		expect(semanticHTML).toContain('<p>text</p>');
	});

	it('does not mutate the original quill.root.innerHTML', () => {
		const originalHTML = '<p>text<span class="resize-handle"></span></p>';
		const quill = makeQuillStub(originalHTML, { ops: [] });
		extractSemanticAndContent(quill);
		// The real DOM node should be untouched
		expect(quill.root.innerHTML).toBe(originalHTML);
	});

	it('handles empty editor HTML gracefully', () => {
		const quill = makeQuillStub('', { ops: [] });
		const { semanticHTML } = extractSemanticAndContent(quill);
		expect(semanticHTML).toBe('');
	});
});
