import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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
	function QuillMock(this: any) {
		this.root = document.createElement('div');
		this.getContents = vi.fn(() => ({ ops: [] }));
		this.setContents = vi.fn();
		this.history = { clear: vi.fn() };
		this.focus = vi.fn();
		this.on = vi.fn();
		this.off = vi.fn();
		this.getSelection = vi.fn(() => ({ index: 0, length: 0 }));
		this.insertEmbed = vi.fn();
		this.setSelection = vi.fn();
		this.insertText = vi.fn();
	}
	const QuillSpy: any = vi.fn(function(this: any, ...args: any[]) {
		QuillMock.apply(this, args);
	});
	QuillSpy.register = vi.fn();
	QuillSpy.sources = { USER: 'user', SILENT: 'silent' };
	return { default: QuillSpy };
});

import Quill from 'quill';

describe('QuillService', () => {
	let service: QuillService;
	const QuillMock = Quill as any;

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

	describe('loadQuill', () => {
		let container: HTMLElement;
		let textChangeCallback: ReturnType<typeof vi.fn>;

		beforeEach(() => {
			container = document.createElement('div');
			document.body.appendChild(container);
			textChangeCallback = vi.fn();
		});

		afterEach(() => {
			document.body.removeChild(container);
		});

		function getLastInstance() {
			return QuillMock.mock.results[QuillMock.mock.results.length - 1].value;
		}

		it('creates and returns a Quill instance', () => {
			const result = service.loadQuill(null, null, container, textChangeCallback);
			expect(QuillMock).toHaveBeenCalled();
			expect(result).toBeTruthy();
		});

		it('calls setContents with empty array when initialContent is null', () => {
			service.loadQuill(null, null, container, textChangeCallback);
			expect(getLastInstance().setContents).toHaveBeenCalledWith([], 'api');
		});

		it('calls setContents with provided initialContent', () => {
			const delta: any = { ops: [{ insert: 'Hello' }] };
			service.loadQuill('editor-1', delta, container, textChangeCallback);
			expect(getLastInstance().setContents).toHaveBeenCalledWith(delta, 'api');
		});

		it('invokes textChangeCallback on text-change event', () => {
			service.loadQuill(null, null, container, textChangeCallback);
			const instance = getLastInstance();
			const textChangeCall = instance.on.mock.calls.find((c: any[]) => c[0] === 'text-change');
			expect(textChangeCall).toBeTruthy();
			textChangeCall[1]();
			expect(textChangeCallback).toHaveBeenCalled();
		});

		it('uses default placeholder when none provided', () => {
			service.loadQuill(null, null, container, textChangeCallback);
			const lastCall = QuillMock.mock.calls[QuillMock.mock.calls.length - 1];
			expect(lastCall[1].placeholder).toBe('Start typing...');
		});

		it('uses custom placeholder when provided', () => {
			service.loadQuill(null, null, container, textChangeCallback, 'Type here...');
			const lastCall = QuillMock.mock.calls[QuillMock.mock.calls.length - 1];
			expect(lastCall[1].placeholder).toBe('Type here...');
		});

		it('uses a toolbar-id selector when quillId is provided', () => {
			service.loadQuill('my-id', null, container, textChangeCallback);
			const lastCall = QuillMock.mock.calls[QuillMock.mock.calls.length - 1];
			expect(lastCall[1].modules.toolbar.container).toBe('[data-toolbar-id="toolbar-my-id"]');
		});

		it('uses DEFAULT_TOOLBAR_CONFIG array when quillId is null', () => {
			service.loadQuill(null, null, container, textChangeCallback);
			const lastCall = QuillMock.mock.calls[QuillMock.mock.calls.length - 1];
			expect(Array.isArray(lastCall[1].modules.toolbar.container)).toBe(true);
		});

		it('clears history after setting content', () => {
			service.loadQuill(null, null, container, textChangeCallback);
			expect(getLastInstance().history.clear).toHaveBeenCalled();
		});

		it('calls focus after loading', () => {
			service.loadQuill(null, null, container, textChangeCallback);
			expect(getLastInstance().focus).toHaveBeenCalled();
		});
	});
});
