import { Block, CanvasManager } from '@foundation/canvas';
import { MotherComponent } from './lib/mother.component';
export { DimensionToolbarComponent } from './lib/blocks/common/dimension-toolbar/dimension-toolbar.component';
export { RootContainerBlockComponent } from './lib/blocks/containers/abcd/abcd-container-block.component';
export { Area, InteractionRepositoryInterface, MotherComponent } from './lib/mother.component';
// BLOCKS IMPORTS
import { AudioBlockComponent } from './lib/blocks/audio/audio-play-block/audio-block.component';
import { AudioRequestBlockComponent } from './lib/blocks/audio/audio-request-block/audio-request-block.component';
import { CheckboxBlockComponent } from './lib/blocks/form/checkbox-block/checkbox-block.component';
import { FileUploadBlockComponent } from './lib/blocks/form/file-upload-block/file-upload-block.component';
import { MultiSelectBlockComponent } from './lib/blocks/form/multi-select-block/multi-select-block.component';
import { StarRatingBlockComponent } from './lib/blocks/form/star-rating-block/star-rating-block.component';
import { ImageBlockComponent } from './lib/blocks/image-block/image-block.component';
import { GoToBeginningBlockComponent } from './lib/blocks/navigation/goto-beginning-block.component';
import { GoToBlockComponent } from './lib/blocks/navigation/goto-block.component';
import { NextBlockComponent } from './lib/blocks/navigation/next-block.component';
import { PreviousBlockComponent } from './lib/blocks/navigation/previous-block.component';
import { ParagrapheRequestBlockComponent } from './lib/blocks/text/paragraphe-request-block/paragraphe-request-block.component';
import { TextBlockComponent } from './lib/blocks/text/text-block/text-block.component';
import { TextSimpleRequestBlockComponent } from './lib/blocks/text/text-simple-request-block/text-simple-request-block.component';
import { VideoBlockComponent } from './lib/blocks/video-block/video-block.component';

// BLOCKS EXPORTS
export { AudioBlockComponent } from './lib/blocks/audio/audio-play-block/audio-block.component';
export { AudioRequestBlockComponent } from './lib/blocks/audio/audio-request-block/audio-request-block.component';
export { DummyTplComponent } from './lib/blocks/dummy-tpl/dummy-tpl.component';
export { CheckboxBlockComponent } from './lib/blocks/form/checkbox-block/checkbox-block.component';
export { FileUploadBlockComponent } from './lib/blocks/form/file-upload-block/file-upload-block.component';
export { MultiSelectBlockComponent } from './lib/blocks/form/multi-select-block/multi-select-block.component';
export { StarRatingBlockComponent } from './lib/blocks/form/star-rating-block/star-rating-block.component';
export { ImageBlockComponent } from './lib/blocks/image-block/image-block.component';
export { GoToBeginningBlockComponent } from './lib/blocks/navigation/goto-beginning-block.component';
export { GoToBlockComponent } from './lib/blocks/navigation/goto-block.component';
export { NextBlockComponent } from './lib/blocks/navigation/next-block.component';
export { PreviousBlockComponent } from './lib/blocks/navigation/previous-block.component';
export { ParagrapheRequestBlockComponent } from './lib/blocks/text/paragraphe-request-block/paragraphe-request-block.component';
export { TextBlockComponent } from './lib/blocks/text/text-block/text-block.component';
export { TextSimpleRequestBlockComponent } from './lib/blocks/text/text-simple-request-block/text-simple-request-block.component';
export { VideoBlockComponent } from './lib/blocks/video-block/video-block.component';

export type BlockMap = { component: typeof MotherComponent; title: string; tags: string[]; partialBlockStarter?: Partial<Block> };
export type BlocksComponentsMap = Record<string, BlockMap>;

export const DEFAULT_BLOCKS_COMPONENTS: BlocksComponentsMap = {
	// 'dummy-tpl': {
	// 	title: 'Dummy',
	// 	component: DummyTplComponent,
	// 	tags: ['dummy', 'utility', 'placeholder', 'development'],
	// },
	// 'abcd-container-block': {
	// 	title: 'ABCD Container',
	// 	component: AbcdContainerBlockComponent,
	// 	tags: ['default', 'container', 'abcd', 'layout', 'visual'],
	// 	partialBlockStarter: {
	// 		width: 100,
	// 		widthUnits: '%',
	// 		height: 100,
	// 		heightUnits: '%',
	// 		posX: 0,
	// 		posY: 0,
	// 	},
	// },
	'audio-request-block': {
		title: 'Media request',
		component: AudioRequestBlockComponent,
		tags: ['default', 'audio', 'media', 'request', 'input', 'form', 'interactive', 'recording', 'user-input'],
		partialBlockStarter: {
			width: 450,
			height: 450,
		},
	},
	'file-upload-block': {
		title: 'File Upload',
		component: FileUploadBlockComponent,
		tags: ['default', 'file', 'upload', 'form', 'input', 'interactive', 'document', 'attachment', 'user-input'],
	},
	'paragraphe-request-block': {
		title: 'Paragraphe request',
		component: ParagrapheRequestBlockComponent,
		tags: ['default', 'text', 'request', 'input', 'form', 'content', 'interactive', 'user-input', 'multiline'],
	},
	'next-block': {
		title: 'Next',
		component: NextBlockComponent,
		tags: ['navigation', 'action', 'flow', 'button', 'interactive', 'control'],
		partialBlockStarter: {
			width: 200,
			height: 60,
		},
	},
	'previous-block': {
		title: 'Previous',
		component: PreviousBlockComponent,
		tags: ['navigation', 'action', 'flow', 'button', 'interactive', 'control'],
		partialBlockStarter: {
			width: 200,
			height: 60,
		},
	},
	'goto-block': {
		title: 'Go To',
		component: GoToBlockComponent,
		tags: ['navigation', 'action', 'flow', 'button', 'interactive', 'control', 'custom'],
		partialBlockStarter: {
			width: 200,
			height: 60,
		},
	},
	'goto-beginning-block': {
		title: 'Go to Beginning',
		component: GoToBeginningBlockComponent,
		tags: ['navigation', 'action', 'flow', 'button', 'interactive', 'control', 'beginning'],
		partialBlockStarter: {
			width: 200,
			height: 60,
		},
	},
	'text-block': {
		title: 'Paragraphe',
		component: TextBlockComponent,
		tags: ['default', 'text', 'content', 'display', 'readable', 'paragraph', 'static'],
	},
	'image-block': {
		title: 'Image',
		component: ImageBlockComponent,
		tags: ['default', 'image', 'media', 'visual', 'content', 'static', 'graphic'],
		partialBlockStarter: {
			width: 400,
			height: 300,
			data: {
				imageSourceKind: 'entityFile',
			},
		},
	},
	'video-block': {
		title: 'Video player',
		component: VideoBlockComponent,
		tags: ['video', 'media', 'visual', 'content', 'player', 'interactive', 'dynamic'],
	},
	'text-simple-request-block': {
		title: 'Text request',
		component: TextSimpleRequestBlockComponent,
		tags: ['text', 'request', 'input', 'form', 'simple', 'interactive', 'user-input', 'single-line'],
	},
	'audio-player-block': {
		title: 'Audio player',
		component: AudioBlockComponent,
		tags: ['default', 'audio', 'media', 'content', 'player', 'interactive', 'sound', 'playback'],
	},

	'checkbox-block': {
		title: 'Checkbox',
		component: CheckboxBlockComponent,
		tags: ['checkbox', 'form', 'input', 'interactive', 'boolean', 'selection', 'toggle'],
	},
	'multi-select-block': {
		title: 'Multi-Select',
		component: MultiSelectBlockComponent,
		tags: ['checkbox', 'radio', 'form', 'input', 'interactive', 'selection', 'multiple', 'options', 'choice'],
		partialBlockStarter: {
			width: 400,
			height: 200,
		},
	},
	'star-rating-block': {
		title: '5 Stars Review',
		component: StarRatingBlockComponent,
		tags: ['rating', 'stars', 'review', 'feedback', 'form', 'input', 'interactive', 'evaluation'],
	},
};

export const DEFAULT_CANVAS_SPECIAL_FUNCTIONS: Record<string, any> = {
	goTo: (canvas: CanvasManager, block: Block, args: any[]) => {
		if (args[0] && args[0] == 'next') {
			canvas.goToNextCanvas();
			return;
		}
		if (args[0] && args[0] == 'prev') {
			canvas.goToPreviousCanvas();
			return;
		}
		if (args[0] && args[0] == 'custom' && args[1]) {
			canvas.selectCanvasById(args[1]);
			return;
		}
		console.warn('Not handled yet by goTo', args);
	},
};
