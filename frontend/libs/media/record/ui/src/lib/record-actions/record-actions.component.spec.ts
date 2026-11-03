import { TestBed } from '@angular/core/testing';
import { DEFAULT_RECORDING_PROPS, MediaModeOptions, RecordingProps, VideoAspectRatio } from '@foundation/media/record/recorder';
import { RecordActionsComponent } from './record-actions.component';

describe('RecordActionsComponent', () => {
	// The recorder probes MediaRecorder.isTypeSupported as it is constructed; jsdom has no such thing.
	let mediaRecorderBackup: unknown;
	beforeEach(() => {
		mediaRecorderBackup = (globalThis as { MediaRecorder?: unknown }).MediaRecorder;
		(globalThis as { MediaRecorder?: unknown }).MediaRecorder = { isTypeSupported: () => true };
	});
	afterEach(() => {
		(globalThis as { MediaRecorder?: unknown }).MediaRecorder = mediaRecorderBackup;
	});

	const buildFixture = () => {
		TestBed.overrideComponent(RecordActionsComponent, { set: { template: '', imports: [], styles: [] } });

		const fixture = TestBed.createComponent(RecordActionsComponent);
		fixture.detectChanges();
		const component = fixture.componentInstance;

		// The real recorder reaches for getUserMedia and MediaRecorder, neither of which jsdom has.
		const recorder = {
			recordingProps$$$: component._recorderService.recordingProps$$$,
			setRecordingProps: vi.fn(),
			listAudioDevices: vi.fn(async () => undefined),
			listVideoDevices: vi.fn(async () => undefined),
			launchDevices: vi.fn(async () => undefined),
			startRecording: vi.fn(),
			stopRecording: vi.fn(),
			cancelRecording: vi.fn(),
			setAspectRatio: vi.fn(),
		};
		component._recorderService = recorder as never;

		return { fixture, component, recorder };
	};

	const grantedFor = (mediaMode: MediaModeOptions): RecordingProps => ({
		...DEFAULT_RECORDING_PROPS,
		mediaMode,
		cameraAccessGranted: true,
		microphoneAccessGranted: true,
	});

	beforeEach(() => {
		vi.spyOn(console, 'log').mockImplementation(() => undefined);
		vi.spyOn(console, 'warn').mockImplementation(() => undefined);
	});

	afterEach(() => {
		TestBed.resetTestingModule();
		vi.restoreAllMocks();
		vi.useRealTimers();
	});

	it('offers every aspect ratio the recorder supports, each with its label', () => {
		const { component } = buildFixture();

		expect(component.aspectRatioOptions.length).toBe(Object.keys(VideoAspectRatio).length);
		expect(component.aspectRatioOptions.every((option) => !!option.label)).toBe(true);
	});

	it('starts in no mode, not counting, with the countdown at its full length', () => {
		const { component } = buildFixture();

		expect(component.mediaMode).toBeNull();
		expect(component.counting).toBe(false);
		expect(component.counter).toBe(0);
	});

	describe('choosing what to record', () => {
		it('tells the recorder the mode, and does not touch the devices before access is granted', async () => {
			const { component, recorder } = buildFixture();

			await component.setMediaMode(MediaModeOptions.audio);

			expect(component.mediaMode).toBe(MediaModeOptions.audio);
			expect(recorder.setRecordingProps).toHaveBeenCalledWith({ mediaMode: MediaModeOptions.audio });
			expect(recorder.launchDevices).not.toHaveBeenCalled();
		});

		it('opens the devices straight away once access is already granted', async () => {
			const { component, recorder } = buildFixture();
			component.recordingProps = grantedFor(MediaModeOptions.audio);

			await component.setMediaMode(MediaModeOptions.audio);

			expect(recorder.launchDevices).toHaveBeenCalled();
		});

		it('follows the mode a parent sets, and clears it again', () => {
			const { fixture, component } = buildFixture();

			fixture.componentRef.setInput('mediaModeSetter', 'video');
			fixture.detectChanges();
			expect(component.mediaMode).toBe(MediaModeOptions.video);

			fixture.componentRef.setInput('mediaModeSetter', null);
			fixture.detectChanges();
			expect(component.mediaMode).toBeNull();
		});
	});

	describe('what counts as granted', () => {
		it('audio needs the microphone alone', () => {
			const { component } = buildFixture();

			component.recordingProps = { ...DEFAULT_RECORDING_PROPS, mediaMode: MediaModeOptions.audio, microphoneAccessGranted: true };
			expect(component.isEverythingGranted()).toBe(true);

			component.recordingProps = { ...DEFAULT_RECORDING_PROPS, mediaMode: MediaModeOptions.audio };
			expect(component.isEverythingGranted()).toBe(false);
		});

		it('video and screen-with-camera need both the camera and the microphone', () => {
			const { component } = buildFixture();

			for (const mediaMode of [MediaModeOptions.video, MediaModeOptions.screenCaptureAndVideo]) {
				component.recordingProps = grantedFor(mediaMode);
				expect(component.isEverythingGranted()).toBe(true);

				component.recordingProps = { ...grantedFor(mediaMode), cameraAccessGranted: false };
				expect(component.isEverythingGranted()).toBe(false);
			}
		});

		it('is not granted while no mode is chosen', () => {
			const { component } = buildFixture();

			expect(component.isEverythingGranted()).toBe(false);
		});
	});

	describe('asking for access', () => {
		it('asks for the camera without the microphone, then opens the devices if that is enough', async () => {
			const { component, recorder } = buildFixture();
			component.recordingProps = grantedFor(MediaModeOptions.video);

			await component.requestCameraAccess();

			expect(recorder.listVideoDevices).toHaveBeenCalledWith({ removeMicBrowser: true, canAskForPermission: true, includeAudio: false });
			expect(recorder.launchDevices).toHaveBeenCalled();
		});

		it('asks for the microphone', async () => {
			const { component, recorder } = buildFixture();
			component.recordingProps = grantedFor(MediaModeOptions.audio);

			await component.requestMicrophoneAccess();

			expect(recorder.listAudioDevices).toHaveBeenCalledWith({ removeMicBrowser: true, canAskForPermission: true });
			expect(recorder.launchDevices).toHaveBeenCalled();
		});

		it('does not open the devices when access is still missing', async () => {
			const { component, recorder } = buildFixture();

			await component.requestCameraAccess();
			await component.requestMicrophoneAccess();

			expect(recorder.launchDevices).not.toHaveBeenCalled();
		});

		// A refusal cancels whatever recording was in flight rather than leaving it half-started.
		it('hands a cancel callback to the permission prompts', async () => {
			const { component, recorder } = buildFixture();

			await component.askForAudioPermissions();
			await component.askForVideoPermissions();

			expect(recorder.listAudioDevices).toHaveBeenCalledWith(expect.anything(), expect.any(Function));
			expect(recorder.listVideoDevices).toHaveBeenCalledWith(expect.anything(), expect.any(Function));
		});
	});

	describe('choosing a device', () => {
		it('records the chosen microphone and reopens the devices', () => {
			const { component, recorder } = buildFixture();
			component.recordingProps = grantedFor(MediaModeOptions.audio);
			const device = { deviceId: 'mic-1' } as MediaDeviceInfo;

			component.updateAudioDevice(device);

			expect(recorder.setRecordingProps).toHaveBeenCalledWith({ selectedAudioDevice: device });
			expect(recorder.launchDevices).toHaveBeenCalled();
		});

		it('records the chosen camera and reopens the devices', async () => {
			const { component, recorder } = buildFixture();
			component.recordingProps = grantedFor(MediaModeOptions.video);
			const device = { deviceId: 'cam-1' } as MediaDeviceInfo;

			await component.updateVideoDevice(device);

			expect(recorder.setRecordingProps).toHaveBeenCalledWith({ selectedVideoDevice: device });
			expect(recorder.launchDevices).toHaveBeenCalled();
		});

		it('records the choice without reopening while access is missing', () => {
			const { component, recorder } = buildFixture();

			component.updateAudioDevice({ deviceId: 'mic-1' } as MediaDeviceInfo);

			expect(recorder.setRecordingProps).toHaveBeenCalled();
			expect(recorder.launchDevices).not.toHaveBeenCalled();
		});
	});

	describe('the aspect ratio', () => {
		it('is passed to the recorder and reopens the devices to apply it', () => {
			const { component, recorder } = buildFixture();
			component.recordingProps = grantedFor(MediaModeOptions.video);

			component.setAspectRatio(VideoAspectRatio.ratio16_9);

			expect(recorder.setAspectRatio).toHaveBeenCalledWith(VideoAspectRatio.ratio16_9);
			expect(recorder.launchDevices).toHaveBeenCalled();
		});

		it('is labelled, falling back to the value itself for one it has no label for', () => {
			const { component } = buildFixture();

			expect(component.getAspectRatioLabel(VideoAspectRatio.ratio16_9)).toBeTruthy();
			expect(component.getAspectRatioLabel('made-up' as never)).toBe('made-up');
		});
	});

	describe('the countdown before recording', () => {
		it('starts the recording once the countdown runs out', () => {
			vi.useFakeTimers();
			const { component, recorder } = buildFixture();
			component.recordingTargetName = 'step-1';
			component.timerDuration = 3;

			component.toggleRecordCounter();
			expect(component.counting).toBe(true);

			vi.advanceTimersByTime(3000);

			expect(recorder.startRecording).toHaveBeenCalledWith('step-1', expect.any(Function), expect.any(Function));
			expect(component.counting).toBe(false);
		});

		it('counts down in tenths, so the display can show whole seconds left', () => {
			vi.useFakeTimers();
			const { component } = buildFixture();
			component.recordingTargetName = 'step-1';
			component.timerDuration = 3;
			component.toggleRecordCounter();

			vi.advanceTimersByTime(1000);

			expect(component.timeLeft).toBe(2);
		});

		it('pressing again while counting cancels instead of starting a second one', () => {
			vi.useFakeTimers();
			const { component, recorder } = buildFixture();
			component.recordingTargetName = 'step-1';
			component.toggleRecordCounter();

			component.toggleRecordCounter();
			vi.advanceTimersByTime(5000);

			expect(component.counting).toBe(false);
			expect(recorder.startRecording).not.toHaveBeenCalled();
		});

		it('refuses to count down without knowing what it is recording for', () => {
			const { component } = buildFixture();

			component.toggleRecordCounter();

			expect(component.counting).toBe(false);
		});

		it('publishes each chunk the recorder hands over', () => {
			vi.useFakeTimers();
			const { component, recorder } = buildFixture();
			const chunks: Blob[] = [];
			component.chunkAvailableEvent.subscribe((chunk) => chunks.push(chunk));
			component.recordingTargetName = 'step-1';
			component.toggleRecordCounter();
			vi.advanceTimersByTime(3000);

			const onChunk = recorder.startRecording.mock.calls[0][1] as (chunk: Blob) => void;
			onChunk(new Blob(['x']));

			expect(chunks).toHaveLength(1);
		});
	});

	describe('finishing', () => {
		it('publishes the finished file and leaves no mode selected', () => {
			const { component, recorder } = buildFixture();
			const files: File[] = [];
			component.fileAvailableEvent.subscribe((file) => files.push(file));

			component.stopRecording();
			const onFile = recorder.stopRecording.mock.calls[0][0] as (file: File, target: string) => void;
			onFile(new File(['x'], 'take.webm'), 'step-1');

			expect(files.map((file) => file.name)).toEqual(['take.webm']);
			expect(component.mediaMode).toBeNull();
		});

		it('cancelling releases the devices and forgets the mode', () => {
			const { component, recorder } = buildFixture();
			component.mediaMode = MediaModeOptions.audio;

			component.cancelCurrentRecording();

			expect(recorder.cancelRecording).toHaveBeenCalled();
			expect(component.mediaMode).toBeNull();
		});

		// Otherwise the mic or camera stays live after the step is left.
		it('releases the devices when it leaves the page, countdown included', () => {
			vi.useFakeTimers();
			const { component, recorder } = buildFixture();
			component.recordingTargetName = 'step-1';
			component.toggleRecordCounter();

			component.ngOnDestroy();

			expect(recorder.cancelRecording).toHaveBeenCalled();
			expect(component.counting).toBe(false);
		});
	});

	describe('a file chosen instead of recorded', () => {
		it('publishes the first file picked', () => {
			const { component } = buildFixture();
			const files: File[] = [];
			component.fileAvailableEvent.subscribe((file) => files.push(file));
			const input = document.createElement('input');
			Object.defineProperty(input, 'files', { value: [new File(['x'], 'take.webm')] });

			component.handleFileInputEvent({ target: input } as unknown as Event);

			expect(files.map((file) => file.name)).toEqual(['take.webm']);
		});

		it('publishes nothing when the picker is dismissed', () => {
			const { component } = buildFixture();
			const files: File[] = [];
			component.fileAvailableEvent.subscribe((file) => files.push(file));
			const input = document.createElement('input');
			Object.defineProperty(input, 'files', { value: [] });

			component.handleFileInputEvent({ target: input } as unknown as Event);
			component.handleFileInputEvent({ target: null } as unknown as Event);

			expect(files).toEqual([]);
		});

		it('has no in-app file browser yet', () => {
			const { component } = buildFixture();

			expect(() => component.openFileSelector()).toThrow('Method not implemented.');
		});
	});

	it('announces a change of recording state to its parent', () => {
		const { component } = buildFixture();
		const states: RecordingProps[] = [];
		component.recordStateChangeEvent.subscribe((props) => states.push(props));

		component._recorderService.recordingProps$$$.next({ ...DEFAULT_RECORDING_PROPS, recordingState: 'recording' });

		expect(states.map((props) => props.recordingState)).toContain('recording');
		expect(component.counting).toBe(false);
	});

	it('passes text through untranslated for now', () => {
		const { component } = buildFixture();

		expect(component.t('Record')).toBe('Record');
	});
});
