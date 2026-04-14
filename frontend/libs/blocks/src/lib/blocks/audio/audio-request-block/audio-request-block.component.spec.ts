import { AudioRequestBlockComponent } from './audio-request-block.component';

vi.mock('@foundation/files/state', () => ({
	convertToUrl: vi.fn((...args: any[]) => `https://example.com/file`),
	FilesRepository: vi.fn(),
}));

describe('AudioRequestBlockComponent', () => {
	describe('getExportOptions', () => {
		const opts = AudioRequestBlockComponent.getExportOptions();

		it('returns 1 export option', () => {
			expect(opts.length).toBe(1);
			expect(opts[0].id).toBe('audio-request-block-recordings-as-urls');
			expect(opts[0].kind).toBe('media');
		});

		it('returns empty array for null interaction', () => {
			const result = opts[0].fn({ id: 's1' } as any, { id: 'b1' } as any, null as any, 'o1');
			expect(result).toEqual([]);
		});

		it('returns empty array when no recordings', () => {
			const interaction = { config: { 'o1.s1.b1.recordings': null } };
			const result = opts[0].fn({ id: 's1' } as any, { id: 'b1' } as any, interaction as any, 'o1');
			expect(result).toEqual([]);
		});

		it('returns only selected, non-deleted recordings', () => {
			const recordings = [
				{ id: 'r1', date: 123, entityFileId: 'ef1', selected: true, deleted: false },
				{ id: 'r2', date: 456, entityFileId: 'ef2', selected: false, deleted: false },
				{ id: 'r3', date: 789, entityFileId: 'ef3', selected: true, deleted: true },
				{ id: 'r4', date: 101, entityFileId: 'ef4', selected: true, deleted: false },
			];
			const interaction = { config: { 'o1.s1.b1.recordings': recordings } };
			const result = opts[0].fn({ id: 's1' } as any, { id: 'b1' } as any, interaction as any, 'o1');
			expect(result).toHaveLength(2);
			expect(result[0].id).toBe('r1');
			expect(result[1].id).toBe('r4');
		});

		it('maps recording to correct output shape', () => {
			const recordings = [{ id: 'r1', date: 123, entityFileId: 'ef1', selected: true }];
			const interaction = { config: { 'o1.s1.b1.recordings': recordings } };
			const result = opts[0].fn({ id: 's1' } as any, { id: 'b1' } as any, interaction as any, 'o1');
			expect(result[0]).toHaveProperty('id', 'r1');
			expect(result[0]).toHaveProperty('title', 123);
			expect(result[0]).toHaveProperty('entityFileId', 'ef1');
			expect(result[0]).toHaveProperty('link');
		});
	});
});
