import { ParagrapheRequestBlockComponent } from './paragraphe-request-block.component';

vi.mock('quill', () => {
	const mockQuill = vi.fn();
	(mockQuill as any).register = vi.fn();
	return { default: mockQuill, Delta: vi.fn() };
});

vi.mock('@foundation/quill/themes', () => ({ DefaultTheme: {} }));

describe('ParagrapheRequestBlockComponent', () => {
	it('getExportOptions returns 2 options', () => {
		const opts = ParagrapheRequestBlockComponent.getExportOptions();
		expect(opts.length).toBe(2);
		expect(opts[0].id).toBe('paragraphe-request-as-plain-text');
		expect(opts[1].id).toBe('paragraphe-request-as-html');
	});

	it('plain-text returns empty for null interaction', () => {
		const opt = ParagrapheRequestBlockComponent.getExportOptions()[0];
		expect(opt.fn({ id: 's1' } as any, { id: 'b1' } as any, null as any, 'o1')).toBe('');
	});
});
