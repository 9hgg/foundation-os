import {
	DEFAULT_BLOCKS_COMPONENTS,
	DEFAULT_CANVAS_SPECIAL_FUNCTIONS,
	AudioRequestBlockComponent,
	FileUploadBlockComponent,
	GoToBlockComponent,
	ImageBlockComponent,
	NextBlockComponent,
	PreviousBlockComponent,
	TextBlockComponent,
} from './index';

describe('blocks public index', () => {
	describe('DEFAULT_BLOCKS_COMPONENTS', () => {
		it('registers the expected default block ids', () => {
			expect(Object.keys(DEFAULT_BLOCKS_COMPONENTS)).toEqual([
				'audio-request-block',
				'file-upload-block',
				'paragraphe-request-block',
				'next-block',
				'previous-block',
				'goto-block',
				'goto-beginning-block',
				'text-block',
				'image-block',
				'video-block',
				'text-simple-request-block',
				'audio-player-block',
				'checkbox-block',
				'multi-select-block',
				'star-rating-block',
			]);
		});

		it('maps registry entries to their exported component classes', () => {
			expect(DEFAULT_BLOCKS_COMPONENTS['audio-request-block'].component).toBe(
				AudioRequestBlockComponent
			);
			expect(DEFAULT_BLOCKS_COMPONENTS['file-upload-block'].component).toBe(
				FileUploadBlockComponent
			);
			expect(DEFAULT_BLOCKS_COMPONENTS['next-block'].component).toBe(NextBlockComponent);
			expect(DEFAULT_BLOCKS_COMPONENTS['previous-block'].component).toBe(PreviousBlockComponent);
			expect(DEFAULT_BLOCKS_COMPONENTS['goto-block'].component).toBe(GoToBlockComponent);
			expect(DEFAULT_BLOCKS_COMPONENTS['text-block'].component).toBe(TextBlockComponent);
			expect(DEFAULT_BLOCKS_COMPONENTS['image-block'].component).toBe(ImageBlockComponent);
		});

		it('provides starter dimensions for large media and navigation blocks', () => {
			expect(DEFAULT_BLOCKS_COMPONENTS['audio-request-block'].partialBlockStarter).toEqual({
				width: 450,
				height: 450,
			});
			expect(DEFAULT_BLOCKS_COMPONENTS['next-block'].partialBlockStarter).toEqual({
				width: 200,
				height: 60,
			});
			expect(DEFAULT_BLOCKS_COMPONENTS['image-block'].partialBlockStarter).toEqual({
				width: 400,
				height: 300,
				data: {
					imageSourceKind: 'entityFile',
				},
			});
		});

		it('keeps registry entries searchable with non-empty titles and tags', () => {
			for (const [blockId, blockMap] of Object.entries(DEFAULT_BLOCKS_COMPONENTS)) {
				expect(blockMap.title, blockId).toEqual(expect.any(String));
				expect(blockMap.title.length, blockId).toBeGreaterThan(0);
				expect(blockMap.tags.length, blockId).toBeGreaterThan(0);
			}
		});
	});

	describe('DEFAULT_CANVAS_SPECIAL_FUNCTIONS.goTo', () => {
		const runGoTo = (args: unknown[]) => {
			const canvas = {
				goToNextCanvas: vi.fn(),
				goToPreviousCanvas: vi.fn(),
				selectCanvasById: vi.fn(),
			};

			DEFAULT_CANVAS_SPECIAL_FUNCTIONS['goTo'](canvas, { id: 'block-1' }, args);

			return canvas;
		};

		it('navigates to the next canvas', () => {
			const canvas = runGoTo(['next']);

			expect(canvas.goToNextCanvas).toHaveBeenCalled();
			expect(canvas.goToPreviousCanvas).not.toHaveBeenCalled();
			expect(canvas.selectCanvasById).not.toHaveBeenCalled();
		});

		it('navigates to the previous canvas', () => {
			const canvas = runGoTo(['prev']);

			expect(canvas.goToPreviousCanvas).toHaveBeenCalled();
			expect(canvas.goToNextCanvas).not.toHaveBeenCalled();
		});

		it('selects a custom canvas by id', () => {
			const canvas = runGoTo(['custom', 'canvas-2']);

			expect(canvas.selectCanvasById).toHaveBeenCalledWith('canvas-2');
		});

		it('warns without navigating for unsupported goTo arguments', () => {
			const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
			const canvas = runGoTo(['unknown']);

			expect(canvas.goToNextCanvas).not.toHaveBeenCalled();
			expect(canvas.goToPreviousCanvas).not.toHaveBeenCalled();
			expect(canvas.selectCanvasById).not.toHaveBeenCalled();
			expect(warn).toHaveBeenCalledWith('Not handled yet by goTo', ['unknown']);
		});
	});
});
