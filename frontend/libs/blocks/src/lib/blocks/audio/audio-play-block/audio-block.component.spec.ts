import { NO_ERRORS_SCHEMA } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FileModals } from '@foundation/files/modals';
import { NotificationService } from '@foundation/notification';
import { PortalService } from '@foundation/utils';
import { AudioBlockComponent } from './audio-block.component';

vi.mock('@foundation/files/state', () => ({
	convertToUrl: vi.fn((file: any) => `https://example.com/${file?.publicFilename || 'file'}`),
	FilesRepository: vi.fn(),
}));

const notificationMock = { snack: vi.fn(), snackSuccess: vi.fn(), snackError: vi.fn() };
const portalServiceMock = { updatePortal: vi.fn(), getPortal$$$: vi.fn() };
const fileModalsMock = { openFilesSelectionDialog: vi.fn() };

describe('AudioBlockComponent', () => {
	let component: AudioBlockComponent;

	beforeEach(() => {
		vi.clearAllMocks();
		TestBed.configureTestingModule({
			imports: [AudioBlockComponent],
			providers: [
				{ provide: NotificationService, useValue: notificationMock },
				{ provide: PortalService, useValue: portalServiceMock },
				{ provide: FileModals, useValue: fileModalsMock },
			],
			schemas: [NO_ERRORS_SCHEMA],
		})
			.overrideComponent(AudioBlockComponent, {
				set: { imports: [], schemas: [NO_ERRORS_SCHEMA] },
			})
			.compileComponents();
		const fixture = TestBed.createComponent(AudioBlockComponent);
		component = fixture.componentInstance;
		fixture.detectChanges();
	});

	it('should be created', () => {
		expect(component).toBeTruthy();
	});

	it('has default signal values', () => {
		expect(component.audioSourceKind()).toBe('entityFile');
		expect(component.audioSourceUrl()).toBe('');
		expect(component.audioSourceEntityFile()).toBeNull();
		expect(component.audioTitle()).toBe('');
	});

	it('audioUrl returns default when no entity file', () => {
		expect(component.audioUrl()).toBe('/assets/interviews/ui/crowd-cheering.mp3');
	});

	it('audioUrl returns url when kind is url', () => {
		component.audioSourceKind.set('url');
		component.audioSourceUrl.set('https://my-audio.mp3');
		expect(component.audioUrl()).toBe('https://my-audio.mp3');
	});

	it('audioUrl returns converted url for entity file', () => {
		component.audioSourceKind.set('entityFile');
		component.audioSourceEntityFile.set({ publicFilename: 'test.mp3' } as any);
		expect(component.audioUrl()).toBe('https://example.com/test.mp3');
	});

	it('processUploadedFiles filters undefined and sets entity file', () => {
		const file = { id: 'f1', publicFilename: 'test.mp3' } as any;
		component.processUploadedFiles([undefined, file, undefined]);
		expect(component.audioSourceKind()).toBe('entityFile');
		expect(component.audioSourceEntityFile()).toBe(file);
	});

	it('processUploadedFiles does nothing with empty array', () => {
		component.processUploadedFiles([]);
		expect(component.audioSourceEntityFile()).toBeNull();
	});

	it('useAnExistingFile opens file selection dialog', () => {
		const closedSub = { subscribe: vi.fn() };
		fileModalsMock.openFilesSelectionDialog.mockReturnValue({ closed: closedSub });
		component.useAnExistingFile();
		expect(fileModalsMock.openFilesSelectionDialog).toHaveBeenCalledWith({
			selectionConstraints: { single: true, maxFiles: 1, minFiles: 1 },
			filters: [{ fieldName: 'kind', value: 'audio' }],
		});
	});
});
