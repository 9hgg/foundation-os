import { TestBed } from '@angular/core/testing';
import { FileModals } from '@foundation/files/modals';
import { FilesRepository } from '@foundation/files/state';
import { ImageBlotContextMenuService, VideoBlotContextMenuService } from '@foundation/quill/blots';
import Quill from 'quill';
import { BehaviorSubject, of } from 'rxjs';
import { QuillService } from './quill.service';

const relativeUrlOf = (fileId: string) => `/api/files/storage/read/${fileId}/original`;

describe('QuillService', () => {
	// Quill measures the caret through Range geometry, which jsdom does not implement.
	beforeAll(() => {
		Range.prototype.getBoundingClientRect = () => new DOMRect();
		Range.prototype.getClientRects = () => Object.assign([], { item: () => null });
	});

	const buildService = (uploaded: unknown = { id: 'file-1', kind: 'image', publicFilename: 'pic.png' }) => {
		const handleFileList$ = vi.fn(() => of([{ result: { file: uploaded } }]));
		const closed = new BehaviorSubject<unknown>(null);
		const openFilesSelectionDialog = vi.fn(() => ({ closed }));
		const setImageContextMenu = vi.fn();
		const setVideoContextMenu = vi.fn();

		TestBed.configureTestingModule({
			providers: [
				QuillService,
				{ provide: FilesRepository, useValue: { handleFileList$ } },
				{ provide: FileModals, useValue: { openFilesSelectionDialog } },
				{ provide: ImageBlotContextMenuService, useValue: { setContextMenuInWindow: setImageContextMenu } },
				{ provide: VideoBlotContextMenuService, useValue: { setContextMenuInWindow: setVideoContextMenu } },
			],
		});

		return {
			service: TestBed.inject(QuillService),
			handleFileList$,
			openFilesSelectionDialog,
			closed,
			setImageContextMenu,
			setVideoContextMenu,
		};
	};

	const hosts: HTMLElement[] = [];
	const buildEditor = (service: QuillService, quillId: string | null = null, initialContent: unknown = null, placeholder?: string) => {
		const host = document.createElement('div');
		document.body.appendChild(host);
		hosts.push(host);
		if (quillId) {
			const toolbar = document.createElement('div');
			toolbar.setAttribute('data-toolbar-id', `toolbar-${quillId}`);
			document.body.appendChild(toolbar);
			hosts.push(toolbar);
		}
		const textChanges: { semanticHTML: string }[] = [];
		const quill = placeholder
			? service.loadQuill(quillId, initialContent as never, host, (details) => textChanges.push(details), placeholder)
			: service.loadQuill(quillId, initialContent as never, host, (details) => textChanges.push(details));
		return { quill, host, textChanges };
	};

	// jsdom has no DragEvent or ClipboardEvent carrying files; the handlers only read .files.
	const dropFiles = (quill: Quill, files: File[]) => {
		const event = new Event('drop', { bubbles: true });
		Object.defineProperty(event, 'dataTransfer', { value: { files } });
		quill.root.dispatchEvent(event);
	};
	const pasteFiles = (quill: Quill, files: File[]) => {
		const event = new Event('paste', { bubbles: true });
		// Quill's own clipboard module reads getData on the way past; without it, it logs a TypeError.
		Object.defineProperty(event, 'clipboardData', { value: { files, getData: () => '' } });
		quill.root.dispatchEvent(event);
	};

	afterEach(() => {
		hosts.splice(0).forEach((host) => host.remove());
		TestBed.resetTestingModule();
	});

	// The blots draw their own context menus into the window, once per service.
	it('installs the image and video context menus on construction', () => {
		const { setImageContextMenu, setVideoContextMenu } = buildService();

		expect(setImageContextMenu).toHaveBeenCalled();
		expect(setVideoContextMenu).toHaveBeenCalled();
	});

	describe('loading an editor', () => {
		it('starts empty when given no content', () => {
			const { service } = buildService();

			const { quill } = buildEditor(service);

			expect(quill.getText().trim()).toBe('');
		});

		it('loads the content it is given, with no history to undo it', () => {
			const { service } = buildService();

			const { quill } = buildEditor(service, null, { ops: [{ insert: 'Hello\n' }] });

			expect(quill.getText()).toContain('Hello');
			expect(quill.history.stack.undo).toHaveLength(0);
		});

		it('reports every edit back, with the resize handles stripped out', () => {
			const { service } = buildService();
			const { quill, textChanges } = buildEditor(service);

			quill.setText('rewritten');

			expect(textChanges.at(-1)?.semanticHTML).toContain('rewritten');
			expect(textChanges.at(-1)?.semanticHTML).not.toContain('resize-handle');
		});

		it('prompts with a default placeholder, or the one it is given', () => {
			const { service } = buildService();

			expect(buildEditor(service).host.querySelector('.ql-editor')?.getAttribute('data-placeholder')).toBe('Start typing...');
			expect(buildEditor(service, null, null, 'Type here...').host.querySelector('.ql-editor')?.getAttribute('data-placeholder')).toBe('Type here...');
		});

		it('uses the page toolbar when one is named', () => {
			const { service } = buildService();

			const { quill } = buildEditor(service, 'editor-1');
			const toolbar = quill.getModule('toolbar') as { container?: HTMLElement | null };

			expect(toolbar.container?.getAttribute('data-toolbar-id')).toBe('toolbar-editor-1');
		});

		it('builds its own toolbar when none is named', () => {
			const { service } = buildService();

			const { quill } = buildEditor(service);
			const toolbar = quill.getModule('toolbar') as { container?: HTMLElement | null };

			expect(toolbar.container?.querySelector('.ql-bold')).not.toBeNull();
		});
	});

	describe('a file dropped or pasted into the editor', () => {
		it('is uploaded and embedded as an image', () => {
			const { service, handleFileList$ } = buildService();
			const { quill } = buildEditor(service);

			dropFiles(quill, [new File(['x'], 'pic.png', { type: 'image/png' })]);

			expect(handleFileList$).toHaveBeenCalled();
			expect(quill.getContents().ops.some((op) => (op.insert as Record<string, unknown>)?.['image'])).toBe(true);
		});

		it('is embedded as a video when that is what it is', () => {
			const { service } = buildService({ id: 'file-2', kind: 'video', publicFilename: 'clip.mp4' });
			const { quill } = buildEditor(service);

			dropFiles(quill, [new File(['x'], 'clip.mp4', { type: 'video/mp4' })]);

			expect(quill.getContents().ops.some((op) => (op.insert as Record<string, unknown>)?.['video'])).toBe(true);
		});

		it('is embedded by its mime type when the kind does not say', () => {
			const { service } = buildService({ id: 'file-3', kind: 'file', mimeClient: 'image/webp', publicFilename: 'pic.webp' });
			const { quill } = buildEditor(service);

			dropFiles(quill, [new File(['x'], 'pic.webp', { type: 'image/webp' })]);

			expect(quill.getContents().ops.some((op) => (op.insert as Record<string, unknown>)?.['image'])).toBe(true);
		});

		it('becomes a link when it is neither an image nor a video', () => {
			const { service } = buildService({ id: 'file-4', kind: 'file', mimeClient: 'application/pdf', publicFilename: 'notes.pdf' });
			const { quill } = buildEditor(service);

			dropFiles(quill, [new File(['x'], 'notes.pdf', { type: 'application/pdf' })]);

			const linked = quill.getContents().ops.find((op) => op.attributes?.['link']);
			expect(linked?.insert).toBe(' notes.pdf ');
			expect(linked?.attributes?.['link']).toBe(relativeUrlOf('file-4'));
		});

		it('is handled the same way when pasted', () => {
			const { service, handleFileList$ } = buildService();
			const { quill } = buildEditor(service);

			pasteFiles(quill, [new File(['x'], 'pic.png', { type: 'image/png' })]);

			expect(handleFileList$).toHaveBeenCalled();
		});

		it('is ignored when the drop or paste carries no file', () => {
			const { service, handleFileList$ } = buildService();
			const { quill } = buildEditor(service);

			dropFiles(quill, []);
			pasteFiles(quill, []);

			expect(handleFileList$).not.toHaveBeenCalled();
		});

		it('embeds nothing when the upload comes back empty', () => {
			const { service, handleFileList$ } = buildService();
			handleFileList$.mockReturnValue(of([{ result: {} }]));
			const { quill } = buildEditor(service);

			dropFiles(quill, [new File(['x'], 'pic.png', { type: 'image/png' })]);

			expect(quill.getContents().ops.some((op) => typeof op.insert === 'object')).toBe(false);
		});
	});

	describe('picking a file already in the library', () => {
		const clickToolbarButton = (quill: Quill, kind: 'image' | 'video') => {
			const handlers = (quill.getModule('toolbar') as { handlers: Record<string, () => void> }).handlers;
			handlers[kind]();
		};

		it('offers only images behind the image button, and embeds the pick', () => {
			const { service, openFilesSelectionDialog, closed } = buildService();
			const { quill } = buildEditor(service);

			clickToolbarButton(quill, 'image');
			closed.next({ files: [{ id: 'file-1', kind: 'image', publicFilename: 'pic.png' }] });

			expect(openFilesSelectionDialog).toHaveBeenCalledWith(expect.objectContaining({ filters: [{ fieldName: 'kind', value: 'image' }] }));
			expect(quill.getContents().ops.some((op) => (op.insert as Record<string, unknown>)?.['image'])).toBe(true);
		});

		it('offers only videos behind the video button, and embeds the pick', () => {
			const { service, openFilesSelectionDialog, closed } = buildService();
			const { quill } = buildEditor(service);

			clickToolbarButton(quill, 'video');
			closed.next({ files: [{ id: 'file-2', kind: 'video', publicFilename: 'clip.mp4' }] });

			expect(openFilesSelectionDialog).toHaveBeenCalledWith(expect.objectContaining({ filters: [{ fieldName: 'kind', value: 'video' }] }));
			expect(quill.getContents().ops.some((op) => (op.insert as Record<string, unknown>)?.['video'])).toBe(true);
		});

		it('links a pick that is neither an image nor a video', () => {
			const { service, closed } = buildService();
			const { quill } = buildEditor(service);

			clickToolbarButton(quill, 'image');
			closed.next({ files: [{ id: 'file-4', kind: 'file', publicFilename: 'notes.pdf' }] });

			expect(quill.getContents().ops.some((op) => op.attributes?.['link'] === relativeUrlOf('file-4'))).toBe(true);
		});

		it('embeds nothing when the picker is dismissed', () => {
			const { service, closed } = buildService();
			const { quill } = buildEditor(service);

			clickToolbarButton(quill, 'image');
			closed.next({ files: [] });

			expect(quill.getContents().ops.some((op) => typeof op.insert === 'object')).toBe(false);
		});
	});

	describe('clearing an editor', () => {
		it('stops reporting edits', () => {
			const { service } = buildService();
			const { quill, textChanges } = buildEditor(service);

			service.clearQuill(quill);
			quill.setText('rewritten');

			expect(textChanges).toHaveLength(0);
		});

		// An auto-generated toolbar is a sibling of the editor, so it survives the container being
		// destroyed and would stack one toolbar per mode toggle.
		it('takes the toolbar it generated itself away with it', () => {
			const { service } = buildService();
			const { quill } = buildEditor(service);
			const toolbar = (quill.getModule('toolbar') as { container: HTMLElement }).container;

			service.clearQuill(quill);

			expect(toolbar.parentElement).toBeNull();
		});

		it('does not throw for an editor with no toolbar module', () => {
			const { service } = buildService();

			expect(() => service.clearQuill({ off: vi.fn(), getModule: () => null } as never)).not.toThrow();
		});
	});
});
