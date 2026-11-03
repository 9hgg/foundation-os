import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { TestBed } from '@angular/core/testing';
import { RecordingModalComponent, RecordingModalData } from './recording-modal.component';

describe('RecordingModalComponent', () => {
	const buildComponent = (data: RecordingModalData = {}) => {
		const close = vi.fn();
		const createObjectURL = vi.fn((file: File) => `blob:${file.name}`);
		const revokeObjectURL = vi.fn();
		Object.defineProperty(URL, 'createObjectURL', { value: createObjectURL, configurable: true });
		Object.defineProperty(URL, 'revokeObjectURL', { value: revokeObjectURL, configurable: true });

		TestBed.configureTestingModule({ providers: [{ provide: DialogRef, useValue: { close } }, { provide: DIALOG_DATA, useValue: data }] });
		TestBed.overrideComponent(RecordingModalComponent, { set: { template: '', imports: [], styles: [] } });

		const fixture = TestBed.createComponent(RecordingModalComponent);
		fixture.detectChanges();

		return { component: fixture.componentInstance, close, revokeObjectURL };
	};

	const audioFile = (name = 'take.webm') => new File(['x'], name, { type: 'audio/webm' });
	const videoFile = (name = 'take.mp4') => new File(['x'], name, { type: 'video/mp4' });

	afterEach(() => {
		TestBed.resetTestingModule();
		vi.restoreAllMocks();
	});

	it('starts with nothing recorded, and exposes the buttons it was opened with', () => {
		const { component } = buildComponent({ displayAudioBtn: true, maxFiles: 2 });

		expect(component.collectedFiles()).toEqual([]);
		expect(component.data).toMatchObject({ displayAudioBtn: true, maxFiles: 2 });
	});

	it('keeps a recording with a playable url and the kind it is', () => {
		const { component } = buildComponent();

		component.onFileProduced(videoFile());

		expect(component.collectedFiles()[0]).toMatchObject({ url: 'blob:take.mp4', mediaType: 'video' });
		expect(component.collectedFiles()[0].id).toBeTruthy();
	});

	it('treats anything that is not video as audio', () => {
		const { component } = buildComponent();

		component.onFileProduced(audioFile());

		expect(component.collectedFiles()[0].mediaType).toBe('audio');
	});

	it('ignores a recording that never materialised', () => {
		const { component } = buildComponent();

		component.onFileProduced(undefined as never);

		expect(component.collectedFiles()).toEqual([]);
	});

	// One recording by default: a second take replaces the first rather than piling up.
	it('replaces the previous take once the limit is reached, releasing its url', () => {
		const { component, revokeObjectURL } = buildComponent();
		component.onFileProduced(audioFile('first.webm'));

		component.onFileProduced(audioFile('second.webm'));

		expect(component.collectedFiles().map((recording) => recording.file.name)).toEqual(['second.webm']);
		expect(revokeObjectURL).toHaveBeenCalledWith('blob:first.webm');
	});

	it('collects up to the limit the caller allowed before replacing', () => {
		const { component } = buildComponent({ maxFiles: 2 });

		component.onFileProduced(audioFile('first.webm'));
		component.onFileProduced(audioFile('second.webm'));
		expect(component.collectedFiles()).toHaveLength(2);

		component.onFileProduced(audioFile('third.webm'));
		expect(component.collectedFiles().map((recording) => recording.file.name)).toEqual(['third.webm']);
	});

	it('confirming closes with the recordings themselves', () => {
		const { component, close } = buildComponent();
		component.onFileProduced(audioFile());

		component.confirm();

		expect(close).toHaveBeenCalledWith({ files: [expect.any(File)] });
	});

	it('cancelling closes with nothing', () => {
		const { component, close } = buildComponent();
		component.onFileProduced(audioFile());

		component.cancel();

		expect(close).toHaveBeenCalledWith({ files: [] });
	});

	it('releases every url it made when it goes away', () => {
		const { component, revokeObjectURL } = buildComponent({ maxFiles: 2 });
		component.onFileProduced(audioFile('first.webm'));
		component.onFileProduced(audioFile('second.webm'));

		component.ngOnDestroy();

		expect(revokeObjectURL).toHaveBeenCalledWith('blob:first.webm');
		expect(revokeObjectURL).toHaveBeenCalledWith('blob:second.webm');
	});
});
