import { TextBlockComponent } from './text-block.component';

vi.mock('quill', () => {
	const mockQuill = vi.fn();
	(mockQuill as any).register = vi.fn();
	return { default: mockQuill, Delta: vi.fn() };
});

vi.mock('@foundation/quill/themes', () => ({ DefaultTheme: {} }));

describe('TextBlockComponent', () => {
	it('getExportOptions returns 2 options', () => {
		const opts = TextBlockComponent.getExportOptions();
		expect(opts.length).toBe(2);
		expect(opts[0].id).toBe('paragraphe-as-plain-text');
		expect(opts[1].id).toBe('paragraphe-as-html');
	});

	it('plain-text export returns empty for blocks without semanticHTML', () => {
		const opt = TextBlockComponent.getExportOptions()[0];
		const block = { id: 'b1', data: {} };
		expect(opt.fn({ id: 's1' } as any, block as any, null as any, 'o1')).toBe('');
	});

	it('html export returns semanticHTML as-is', () => {
		const opt = TextBlockComponent.getExportOptions()[1];
		const block = { id: 'b1', data: { semanticHTML: '<p>Hello</p>' } };
		expect(opt.fn({ id: 's1' } as any, block as any, null as any, 'o1')).toBe('<p>Hello</p>');
	});

	it('html export returns empty for missing data', () => {
		const opt = TextBlockComponent.getExportOptions()[1];
		const block = { id: 'b1', data: {} };
		expect(opt.fn({ id: 's1' } as any, block as any, null as any, 'o1')).toBe('');
	});
});
