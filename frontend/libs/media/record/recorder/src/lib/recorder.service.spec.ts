import { TestBed } from '@angular/core/testing';
import { NotificationService } from '@foundation/notification';
import { ASPECT_RATIO_CONSTRAINTS, DEFAULT_RECORDING_PROPS, MediaModeOptions, RecorderService, VideoAspectRatio } from './recorder.service';

describe('recorder.service', () => {
	describe('exports', () => {
		it('exports the recorder surface', () => {
			expect(ASPECT_RATIO_CONSTRAINTS).toBeDefined();
			expect(DEFAULT_RECORDING_PROPS).toBeDefined();
			expect(MediaModeOptions).toBeDefined();
			expect(RecorderService).toBeDefined();
			expect(VideoAspectRatio).toBeDefined();
		});
	});

	describe('RecorderService', () => {
		let mediaRecorderBackup: unknown;

		function createService(): RecorderService {
			TestBed.configureTestingModule({
				providers: [{ provide: NotificationService, useValue: { warning: vi.fn(), error: vi.fn(), success: vi.fn() } }],
			});
			return TestBed.runInInjectionContext(() => new RecorderService());
		}

		beforeEach(() => {
			// The constructor probes MediaRecorder.isTypeSupported, absent in jsdom.
			mediaRecorderBackup = (globalThis as { MediaRecorder?: unknown }).MediaRecorder;
			(globalThis as { MediaRecorder?: unknown }).MediaRecorder = { isTypeSupported: () => true };
		});

		afterEach(() => {
			(globalThis as { MediaRecorder?: unknown }).MediaRecorder = mediaRecorderBackup;
		});

		describe('setRecordingProps → occupied', () => {
			it('is occupied for in-progress states and free otherwise', () => {
				const service = createService();
				for (const state of ['recording-asked', 'recording', 'paused-asked', 'paused', 'stopped-asked'] as const) {
					service.setRecordingProps({ recordingState: state });
					expect(service.recordingProps.occupied).toBe(true);
				}
				for (const state of ['ready-to-record', 'inactive', 'stopped', 'error'] as const) {
					service.setRecordingProps({ recordingState: state });
					expect(service.recordingProps.occupied).toBe(false);
				}
			});
		});

		describe('setRecordingProps → withVideo/withScreen', () => {
			it('derives the channels from the media mode', () => {
				const service = createService();

				service.setRecordingProps({ mediaMode: MediaModeOptions.audio });
				expect(service.recordingProps.withVideo).toBe(false);
				expect(service.recordingProps.withScreen).toBe(false);

				service.setRecordingProps({ mediaMode: MediaModeOptions.video });
				expect(service.recordingProps.withVideo).toBe(true);
				expect(service.recordingProps.withScreen).toBe(false);

				service.setRecordingProps({ mediaMode: MediaModeOptions.screenCapture });
				expect(service.recordingProps.withVideo).toBe(false);
				expect(service.recordingProps.withScreen).toBe(true);

				service.setRecordingProps({ mediaMode: MediaModeOptions.screenCaptureAndVideo });
				expect(service.recordingProps.withVideo).toBe(true);
				expect(service.recordingProps.withScreen).toBe(true);
			});
		});

		describe('stopTracks', () => {
			it('stops every track and releases the stream (mic/camera indicator clears)', () => {
				const service = createService();
				const stop1 = vi.fn();
				const stop2 = vi.fn();
				service.mediaStream = { getTracks: () => [{ stop: stop1 }, { stop: stop2 }] } as unknown as MediaStream;

				service.stopTracks();

				expect(stop1).toHaveBeenCalledOnce();
				expect(stop2).toHaveBeenCalledOnce();
				expect(service.mediaStream).toBeUndefined();
			});

			it('is a no-op with no active stream', () => {
				const service = createService();
				service.mediaStream = undefined;
				expect(() => service.stopTracks()).not.toThrow();
			});
		});
	});
});
