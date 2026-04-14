import { NO_ERRORS_SCHEMA } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { NotificationService } from '@foundation/notification';
import { PortalService } from '@foundation/utils';
import { FileUploadBlockComponent } from './file-upload-block.component';

vi.mock('@foundation/files/state', () => ({
	convertToUrl: vi.fn((file: any) => `https://example.com/${file?.publicFilename || 'file'}`),
	FilesRepository: vi.fn(),
}));

const notificationMock = { snack: vi.fn(), snackSuccess: vi.fn(), snackError: vi.fn() };
const portalServiceMock = { updatePortal: vi.fn(), getPortal$$$: vi.fn() };

describe('FileUploadBlockComponent', () => {
	let component: FileUploadBlockComponent;

	beforeEach(() => {
		vi.clearAllMocks();
		TestBed.configureTestingModule({
			imports: [FileUploadBlockComponent],
			providers: [
				{ provide: NotificationService, useValue: notificationMock },
				{ provide: PortalService, useValue: portalServiceMock },
			],
			schemas: [NO_ERRORS_SCHEMA],
		})
			.overrideComponent(FileUploadBlockComponent, {
				set: { imports: [], schemas: [NO_ERRORS_SCHEMA] },
			})
			.compileComponents();
		const fixture = TestBed.createComponent(FileUploadBlockComponent);
		component = fixture.componentInstance;
		fixture.detectChanges();
	});

	it('should be created', () => {
		expect(component).toBeTruthy();
	});

	it('should have default signal values', () => {
		expect(component.uploadedFiles()).toEqual([]);
		expect(component.allowMultiple()).toBe(false);
		expect(component.acceptedFileTypes()).toBe('*');
		expect(component.maxFileSize()).toBe(10);
		expect(component.label()).toBe('Upload File');
	});

	it('hasFiles is false initially', () => {
		expect(component.hasFiles()).toBe(false);
	});

	it('fileCount is 0 initially', () => {
		expect(component.fileCount()).toBe(0);
	});

	describe('onFilesUploaded', () => {
		it('does nothing in edit mode', () => {
			component.canvasManager = { editorMode: 'edit' } as any;
			component.onFilesUploaded([{ id: 'f1' } as any]);
			expect(component.uploadedFiles().length).toBe(0);
		});

		it('replaces files in single mode', () => {
			component.onFilesUploaded([{ id: 'f1' } as any, { id: 'f2' } as any]);
			expect(component.uploadedFiles().length).toBe(1);
		});

		it('appends files in multiple mode', () => {
			component.allowMultiple.set(true);
			component.onFilesUploaded([{ id: 'f1' } as any]);
			component.onFilesUploaded([{ id: 'f2' } as any]);
			expect(component.uploadedFiles().length).toBe(2);
		});

		it('filters out undefined files', () => {
			component.onFilesUploaded([undefined, { id: 'f1' } as any, undefined]);
			expect(component.uploadedFiles().length).toBe(1);
		});
	});

	describe('removeFile', () => {
		it('removes file at index', () => {
			component.allowMultiple.set(true);
			component.onFilesUploaded([{ id: 'f1' } as any, { id: 'f2' } as any]);
			component.removeFile(0);
			expect(component.uploadedFiles().length).toBe(1);
			expect(component.uploadedFiles()[0].id).toBe('f2');
		});

		it('does nothing in edit mode', () => {
			component.onFilesUploaded([{ id: 'f1' } as any]);
			component.canvasManager = { editorMode: 'edit' } as any;
			component.removeFile(0);
			expect(component.uploadedFiles().length).toBe(1);
		});
	});

	describe('getFileIcon', () => {
		it('returns 📄 for PDF', () => {
			expect(component.getFileIcon({ mime: 'application/pdf' } as any)).toBe('📄');
		});

		it('returns 🖼️ for image', () => {
			expect(component.getFileIcon({ mime: 'image/png' } as any)).toBe('🖼️');
		});

		it('returns 🎥 for video', () => {
			expect(component.getFileIcon({ mime: 'video/mp4' } as any)).toBe('🎥');
		});

		it('returns 🎵 for audio', () => {
			expect(component.getFileIcon({ mime: 'audio/mpeg' } as any)).toBe('🎵');
		});

		it('returns 📎 for unknown', () => {
			expect(component.getFileIcon({ mime: 'application/octet-stream' } as any)).toBe('📎');
		});
	});

	describe('totalSize', () => {
		it('sums file sizes', () => {
			component.allowMultiple.set(true);
			component.onFilesUploaded([{ id: 'f1', size: 100 } as any, { id: 'f2', size: 200 } as any]);
			expect(component.totalSize()).toBe(300);
		});
	});

	describe('export options', () => {
		it('returns 2 export options', () => {
			const opts = FileUploadBlockComponent.getExportOptions();
			expect(opts.length).toBe(2);
			expect(opts.map((o) => o.id)).toEqual(['uploaded-files-list', 'uploaded-files-count']);
		});

		it('uploaded-files-count returns 0 for null interaction', () => {
			const opt = FileUploadBlockComponent.getExportOptions()[1];
			expect(opt.fn({ id: 's1' } as any, { id: 'b1' } as any, null as any, 'o1')).toBe(0);
		});
	});
});
