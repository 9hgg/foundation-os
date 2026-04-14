import { NO_ERRORS_SCHEMA } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FileModals } from '@foundation/files/modals';
import { NotificationService } from '@foundation/notification';
import { PortalService } from '@foundation/utils';
import { VideoBlockComponent } from './video-block.component';

vi.mock('@foundation/files/state', () => ({
	convertToUrl: vi.fn((file: any) => {
		if (file == null) return null;
		if (typeof file === 'object' && file?.publicFilename) return `https://example.com/${file.publicFilename}`;
		return `https://example.com/file`;
	}),
	FilesRepository: vi.fn(),
}));

const notificationMock = { snack: vi.fn(), snackSuccess: vi.fn(), snackError: vi.fn() };
const portalServiceMock = { updatePortal: vi.fn(), getPortal$$$: vi.fn() };
const fileModalsMock = { openFilesSelectionDialog: vi.fn() };

describe('VideoBlockComponent', () => {
	let component: VideoBlockComponent;

	beforeEach(() => {
		vi.clearAllMocks();
		TestBed.configureTestingModule({
			imports: [VideoBlockComponent],
			providers: [
				{ provide: NotificationService, useValue: notificationMock },
				{ provide: PortalService, useValue: portalServiceMock },
				{ provide: FileModals, useValue: fileModalsMock },
			],
			schemas: [NO_ERRORS_SCHEMA],
		})
			.overrideComponent(VideoBlockComponent, {
				set: { imports: [], schemas: [NO_ERRORS_SCHEMA] },
			})
			.compileComponents();
		const fixture = TestBed.createComponent(VideoBlockComponent);
		component = fixture.componentInstance;
		fixture.detectChanges();
	});

	it('should be created', () => {
		expect(component).toBeTruthy();
	});

	it('has default signal values', () => {
		expect(component.videoSourceKind()).toBe('entityFile');
		expect(component.videoSourceUrl()).toBe('');
		expect(component.videoSourceEntityFile()).toBeNull();
		expect(component.disposition()).toBe('scale-down');
	});

	it('videoUrl returns placeholder when no entity file', () => {
		const url = component.videoUrl();
		expect(url).toContain('placeholder');
	});

	it('videoUrl returns converted url for entity file', () => {
		component.videoSourceKind.set('entityFile');
		component.videoSourceEntityFile.set({ publicFilename: 'clip.mp4' } as any);
		expect(component.videoUrl()).toBe('https://example.com/clip.mp4');
	});

	it('videoUrl returns url when kind is url', () => {
		component.videoSourceKind.set('url');
		component.videoSourceUrl.set('https://my-video.mp4');
		expect(component.videoUrl()).toBe('https://my-video.mp4');
	});

	it('processUploadedFiles filters undefined and sets entity file', () => {
		const file = { id: 'f1', publicFilename: 'clip.mp4' } as any;
		component.processUploadedFiles([undefined, file]);
		expect(component.videoSourceKind()).toBe('entityFile');
		expect(component.videoSourceEntityFile()).toBe(file);
	});

	it('processUploadedFiles does nothing with empty array', () => {
		component.processUploadedFiles([]);
		expect(component.videoSourceEntityFile()).toBeNull();
	});

	it('useAnExistingPicture opens file selection dialog', () => {
		const closedSub = { subscribe: vi.fn() };
		fileModalsMock.openFilesSelectionDialog.mockReturnValue({ closed: closedSub });
		component.useAnExistingPicture();
		expect(fileModalsMock.openFilesSelectionDialog).toHaveBeenCalled();
	});

	it('getFileUrl returns converted url', () => {
		const file = { publicFilename: 'test.mp4' } as any;
		const result = component.getFileUrl(file, 'fallback.mp4');
		expect(result).toBe('https://example.com/test.mp4');
	});

	it('getFileUrl calls convertToUrl with file and alternative', () => {
		const file = { id: 'f1', publicFilename: 'clip.mp4' };
		const result = component.getFileUrl(file as any, 'thumbnail');
		expect(result).toBeDefined();
	});
});
