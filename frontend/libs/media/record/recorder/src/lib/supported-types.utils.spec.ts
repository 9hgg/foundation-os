import { getSupportedAudioMimeTypes, getSupportedVideoMimeTypes, MEDIARECORDER_EVENTS, RECORDRTC_MIMETYPES } from './supported-types.utils';

describe('supported-types.utils', () => {
	describe('getSupportedAudioMimeTypes', () => {
		it('is exported', () => {
			expect(getSupportedAudioMimeTypes).toBeDefined();
		});
	});

	describe('getSupportedVideoMimeTypes', () => {
		it('is exported', () => {
			expect(getSupportedVideoMimeTypes).toBeDefined();
		});
	});

	describe('MEDIARECORDER_EVENTS', () => {
		it('is exported', () => {
			expect(MEDIARECORDER_EVENTS).toBeDefined();
		});
	});

	describe('RECORDRTC_MIMETYPES', () => {
		it('is exported', () => {
			expect(RECORDRTC_MIMETYPES).toBeDefined();
		});
	});
});
