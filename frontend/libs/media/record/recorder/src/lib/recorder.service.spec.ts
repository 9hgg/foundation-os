import { ASPECT_RATIO_CONSTRAINTS, DEFAULT_RECORDING_PROPS, MediaModeOptions, RecorderService, VideoAspectRatio } from './recorder.service';

describe('recorder.service', () => {
	describe('ASPECT_RATIO_CONSTRAINTS', () => {
		it('is exported', () => {
			expect(ASPECT_RATIO_CONSTRAINTS).toBeDefined();
		});
	});

	describe('DEFAULT_RECORDING_PROPS', () => {
		it('is exported', () => {
			expect(DEFAULT_RECORDING_PROPS).toBeDefined();
		});
	});

	describe('MediaModeOptions', () => {
		it('is exported', () => {
			expect(MediaModeOptions).toBeDefined();
		});
	});

	describe('RecorderService', () => {
		it('is exported', () => {
			expect(RecorderService).toBeDefined();
		});
	});

	describe('VideoAspectRatio', () => {
		it('is exported', () => {
			expect(VideoAspectRatio).toBeDefined();
		});
	});
});
