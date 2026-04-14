import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { QuillService } from './quill.service';

// ---------------------------------------------------------------------------
// Heavy dependencies that touch the DOM / CDK are replaced with no-op fakes
// ---------------------------------------------------------------------------
const filesRepositoryStub = { handleFileList$: vi.fn() };
const fileModalsStub = { openFilesSelectionDialog: vi.fn() };
const imageContextMenuStub = { setContextMenuInWindow: vi.fn() };
const videoContextMenuStub = { setContextMenuInWindow: vi.fn() };

vi.mock('@foundation/files/state', () => ({
	FilesRepository: class {},
	convertToUrl: vi.fn(() => 'https://example.com/file'),
}));

vi.mock('@foundation/files/modals', () => ({
	FileModals: class {},
}));

vi.mock('@foundation/quill/blots', () => ({
	ImageBlot: class { static blotName = 'image'; },
	VideoBlot: class { static blotName = 'video'; },
	ImageBlotContextMenuService: class { setContextMenuInWindow = vi.fn(); },
	VideoBlotContextMenuService: class { setContextMenuInWindow = vi.fn(); },
}));

import { FilesRepository } from '@foundation/files/state';
import { FileModals } from '@foundation/files/modals';
import { ImageBlotContextMenuService, VideoBlotContextMenuService } from '@foundation/quill/blots';

// Quill itself touches the DOM — stub it out at the module level
vi.mock('quill', () => {
	const QuillMock: any = vi.fn().mockImplementation(() => ({
		root: document.createElement('div'),
		getContents: vi.fn(() => ({ ops: [] })),
		setContents: vi.fn(),
		history: { clear: vi.fn() },
		focus: vi.fn(),
		on: vi.fn(),
		off: vi.fn(),
		getSelection: vi.fn(() => ({ index: 0, length: 0 })),
		insertEmbed: vi.fn(),
		setSelection: vi.fn(),
		insertText: vi.fn(),
	}));
	QuillMock.register = vi.fn();
	QuillMock.sources = { USER: 'user', SILENT: 'silent' };
	return { default: QuillMock };
});

describe('QuillService', () => {
	let service: QuillService;

	beforeEach(() => {
		vi.clearAllMocks();
		TestBed.configureTestingModule({
			providers: [
				QuillService,
				{ provide: FilesRepository, useValue: filesRepositoryStub },
				{ provide: FileModals, useValue: fileModalsStub },
				{ provide: ImageBlotContextMenuService, useValue: imageContextMenuStub },
				{ provide: VideoBlotContextMenuService, useValue: videoContextMenuStub },
			],
		});
		service = TestBed.inject(QuillService);
	});

	it('is created', () => {
		expect(service).toBeTruthy();
	});

	it('clearQuill calls quill.off("text-change") and does not throw', () => {
		const quillMock = {
			off: vi.fn(),
		} as any;
		expect(() => service.clearQuill(quillMock)).not.toThrow();
		expect(quillMock.off).toHaveBeenCalledWith('text-change');
	});
});
