import { NO_ERRORS_SCHEMA } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FileModals } from '@foundation/files/modals';
import { NotificationService } from '@foundation/notification';
import { PortalService } from '@foundation/utils';
import { ImageBlockComponent } from './image-block.component';

vi.mock('@foundation/files/state', () => ({
	convertToUrl: vi.fn((file: any) => `https://example.com/${file?.publicFilename || 'file'}`),
	FilesRepository: vi.fn(),
}));

const notificationMock = { snack: vi.fn(), snackSuccess: vi.fn(), snackError: vi.fn() };
const portalServiceMock = { updatePortal: vi.fn(), getPortal$$$: vi.fn() };
const fileModalsMock = { openFilesSelectionDialog: vi.fn() };

describe('ImageBlockComponent', () => {
	let component: ImageBlockComponent;

	beforeEach(() => {
		vi.clearAllMocks();
		TestBed.configureTestingModule({
			imports: [ImageBlockComponent],
			providers: [
				{ provide: NotificationService, useValue: notificationMock },
				{ provide: PortalService, useValue: portalServiceMock },
				{ provide: FileModals, useValue: fileModalsMock },
			],
			schemas: [NO_ERRORS_SCHEMA],
		})
			.overrideComponent(ImageBlockComponent, {
				set: { imports: [], schemas: [NO_ERRORS_SCHEMA] },
			})
			.compileComponents();
		const fixture = TestBed.createComponent(ImageBlockComponent);
		component = fixture.componentInstance;
		fixture.detectChanges();
	});

	it('should be created', () => {
		expect(component).toBeTruthy();
	});

	it('has default signal values', () => {
		expect(component.imageSourceKind()).toBe('entityFile');
		expect(component.imageSourceUrl()).toBe('');
		expect(component.imageSourceEntityFile()).toBeNull();
		expect(component.alt()).toBe('');
		expect(component.disposition()).toBe('cover');
	});

	it('imageUrl returns placeholder when no entity file', () => {
		const url = component.imageUrl();
		expect(url).toContain('placeholder');
	});

	it('imageUrl returns converted url for entity file', () => {
		component.imageSourceKind.set('entityFile');
		component.imageSourceEntityFile.set({ publicFilename: 'pic.jpg' } as any);
		expect(component.imageUrl()).toBe('https://example.com/pic.jpg');
	});

	it('imageUrl returns url when kind is url', () => {
		component.imageSourceKind.set('url');
		component.imageSourceUrl.set('https://my-pic.jpg');
		expect(component.imageUrl()).toBe('https://my-pic.jpg');
	});

	it('processUploadedFiles filters undefined and sets entity file', () => {
		const file = { id: 'f1', publicFilename: 'pic.jpg' } as any;
		component.processUploadedFiles([undefined, file]);
		expect(component.imageSourceKind()).toBe('entityFile');
		expect(component.imageSourceEntityFile()).toBe(file);
	});

	it('processUploadedFiles does nothing with empty array', () => {
		component.processUploadedFiles([]);
		expect(component.imageSourceEntityFile()).toBeNull();
	});

	it('useAnExistingPicture opens file selection dialog', () => {
		const closedSub = { subscribe: vi.fn() };
		fileModalsMock.openFilesSelectionDialog.mockReturnValue({ closed: closedSub });
		component.useAnExistingPicture();
		expect(fileModalsMock.openFilesSelectionDialog).toHaveBeenCalled();
	});

	describe('getExportOptions', () => {
		it('returns 2 options', () => {
			const opts = ImageBlockComponent.getExportOptions();
			expect(opts.length).toBe(2);
			expect(opts.map((o) => o.id)).toEqual(['image-file', 'image-file']);
		});
	});
});
