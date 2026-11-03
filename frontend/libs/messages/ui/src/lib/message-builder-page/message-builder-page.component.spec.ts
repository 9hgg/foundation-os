import { TestBed } from '@angular/core/testing';
import { FileModals } from '@foundation/files/modals';
import { convertToUrl, FilesRepository } from '@foundation/files/state';
import { MessagesRepository } from '@foundation/messages/state';
import { ImageBlotContextMenuService } from '@foundation/quill/blots';
import { BehaviorSubject, of } from 'rxjs';
import { MessageBuilderPageComponent } from './message-builder-page.component';

describe('MessageBuilderPageComponent', () => {
	const buildMessage = () => ({ id: 'message-1', title: 'A title', content: '<p>hello</p>', config: { deltas: { ops: [{ insert: 'hello' }] } } });

	const buildFixture = (message: unknown = buildMessage()) => {
		const message$ = new BehaviorSubject(message);
		const save = vi.fn();
		const setContextMenuInWindow = vi.fn();
		const closed = new BehaviorSubject<unknown>(null);
		const openFilesSelectionDialog = vi.fn(() => ({ closed }));
		const handleFileList$ = vi.fn(() => of([{ result: { updatedFile: { id: 'file-1', kind: 'image', publicFilename: 'pic.png' } } }]));

		TestBed.configureTestingModule({
			providers: [
				{ provide: MessagesRepository, useValue: { store: { getObjectById$$$: () => ({ $: message$ }), save } } },
				{ provide: FilesRepository, useValue: { handleFileList$ } },
				{ provide: ImageBlotContextMenuService, useValue: { setContextMenuInWindow } },
				{ provide: FileModals, useValue: { openFilesSelectionDialog } },
			],
		});
		TestBed.overrideComponent(MessageBuilderPageComponent, { set: { template: '', imports: [], styles: [] } });

		const fixture = TestBed.createComponent(MessageBuilderPageComponent);
		fixture.componentRef.setInput('messageId', 'message-1');
		fixture.detectChanges();

		return { fixture, component: fixture.componentInstance, save, setContextMenuInWindow, closed, openFilesSelectionDialog, handleFileList$ };
	};

	/** Quill needs a real editor DOM; the editor-facing methods are exercised against a stand-in. */
	const attachFakeQuill = (component: MessageBuilderPageComponent) => {
		const quill = {
			getSelection: vi.fn(() => ({ index: 3 })),
			insertEmbed: vi.fn(),
			insertText: vi.fn(),
			setSelection: vi.fn(),
			off: vi.fn(),
		};
		component.quill = quill as never;
		return quill;
	};

	afterEach(() => TestBed.resetTestingModule());

	it('seeds the editor state from the loaded message', () => {
		const { component } = buildFixture();

		expect(component.messageIsLoaded()).toBe(true);
		expect(component.semanticHTML()).toBe('<p>hello</p>');
		expect(component.content()).toEqual({ ops: [{ insert: 'hello' }] });
	});

	it('stays unloaded while there is no message', () => {
		const { component } = buildFixture(null);

		expect(component.messageIsLoaded()).toBe(false);
		expect(component.semanticHTML()).toBe('');
	});

	it('falls back to empty content for a message with none', () => {
		const { component } = buildFixture({ id: 'message-1', title: 'A title', content: '', config: {} });

		expect(component.semanticHTML()).toBe('');
		expect(component.content()).toBeNull();
	});

	it('installs the image context menu on init', () => {
		const { fixture, setContextMenuInWindow } = buildFixture();

		fixture.componentInstance.ngOnInit();

		expect(setContextMenuInWindow).toHaveBeenCalled();
	});

	it('saves the message when the title changes', () => {
		const { component, save } = buildFixture();

		component.updateTitle('A new title');

		expect(save).toHaveBeenCalledWith(expect.objectContaining({ id: 'message-1', title: 'A new title' }));
	});

	it('does not save a title change before the message is loaded', () => {
		const { component, save } = buildFixture(null);

		component.updateTitle('A new title');

		expect(save).not.toHaveBeenCalled();
	});

	it('drops the editor reference and its listener when cleared', () => {
		const { component } = buildFixture();
		const quill = attachFakeQuill(component);

		component.clearQuill();

		expect(quill.off).toHaveBeenCalledWith('text-change');
		expect(component.quill).toBeNull();
	});

	it('clearing without an editor is a no-op', () => {
		const { component } = buildFixture();

		expect(() => component.clearQuill()).not.toThrow();
	});

	it('inserts an image at the cursor and moves past it', () => {
		const { component } = buildFixture();
		const quill = attachFakeQuill(component);

		component.insertImage({ alt: 'a picture', url: 'https://example.test/pic.png' });

		expect(quill.insertEmbed).toHaveBeenCalledWith(3, 'image', { alt: 'a picture', url: 'https://example.test/pic.png' }, expect.anything());
		expect(quill.setSelection).toHaveBeenCalledWith(4, expect.anything());
	});

	it('inserts an image with an empty alt when none is given', () => {
		const { component } = buildFixture();
		const quill = attachFakeQuill(component);

		component.insertImage({ alt: undefined, url: 'https://example.test/pic.png' });

		expect(quill.insertEmbed).toHaveBeenCalledWith(3, 'image', { alt: '', url: 'https://example.test/pic.png' }, expect.anything());
	});

	it('inserts a non-image file as a link to it', () => {
		const { component } = buildFixture();
		const quill = attachFakeQuill(component);
		const file = { id: 'file-2', publicFilename: 'notes.pdf' };

		component.insertFileAsLink(file as never);

		expect(quill.insertText).toHaveBeenCalledWith(3, ' notes.pdf ', { link: convertToUrl(file as never, 'original') }, expect.anything());
	});

	it('does nothing when inserting without an editor', () => {
		const { component } = buildFixture();

		expect(() => component.insertImage({ alt: 'x', url: 'y' })).not.toThrow();
		expect(() => component.insertFileAsLink({ id: 'file-2', publicFilename: 'notes.pdf' } as never)).not.toThrow();
	});

	it('picks an existing image from the file library and inserts it', () => {
		const { component, closed, openFilesSelectionDialog } = buildFixture();
		const quill = attachFakeQuill(component);

		component.useAnExistingPictureInQuill();
		closed.next({ files: [{ id: 'file-3', publicFilename: 'photo.png' }] });

		expect(openFilesSelectionDialog).toHaveBeenCalledWith(expect.objectContaining({ filters: [{ fieldName: 'kind', value: 'image' }] }));
		expect(quill.insertEmbed).toHaveBeenCalled();
	});

	it('inserts nothing when the picture picker is dismissed', () => {
		const { component, closed } = buildFixture();
		const quill = attachFakeQuill(component);

		component.useAnExistingPictureInQuill();
		closed.next({ files: [] });

		expect(quill.insertEmbed).not.toHaveBeenCalled();
	});

	describe('the editor itself', () => {
		// Quill measures the caret through Range geometry, which jsdom does not implement.
		beforeAll(() => {
			Range.prototype.getBoundingClientRect = () => new DOMRect();
			Range.prototype.getClientRects = () => Object.assign([], { item: () => null });
		});

		// jsdom has no DragEvent; the handler only reads dataTransfer.files.
		const dropOnEditor = (component: MessageBuilderPageComponent, files: File[]) => {
			const dropEvent = new Event('drop', { bubbles: true });
			Object.defineProperty(dropEvent, 'dataTransfer', { value: { files } });
			component.quill?.root.dispatchEvent(dropEvent);
		};

		const loadEditor = (component: MessageBuilderPageComponent) => {
			const toolbar = document.createElement('div');
			toolbar.setAttribute('data-toolbar-id', 'toolbar-message-1');
			const host = document.createElement('div');
			document.body.append(toolbar, host);
			component.loadQuill(host);
			return { host, cleanup: () => [toolbar, host].forEach((element) => element.remove()) };
		};

		it('loads the message content into a fresh editor', () => {
			const { component } = buildFixture();
			const { cleanup } = loadEditor(component);

			expect(component.quill).not.toBeNull();
			expect(component.quill?.getText()).toContain('hello');

			cleanup();
		});

		it('mirrors editor edits into the message content stream', () => {
			const { component } = buildFixture();
			const { cleanup } = loadEditor(component);

			component.quill?.setText('rewritten');

			expect(component.semanticHTML()).toContain('rewritten');
			expect(component.messageContent$$$.value.semanticHTML).toContain('rewritten');

			cleanup();
		});

		it('routes a dropped image through the file repository and into the editor', () => {
			const { component, handleFileList$ } = buildFixture();
			const { cleanup } = loadEditor(component);
			const insertImage = vi.spyOn(component, 'insertImage');

			dropOnEditor(component, [new File(['x'], 'pic.png', { type: 'image/png' })]);

			expect(handleFileList$).toHaveBeenCalled();
			expect(insertImage).toHaveBeenCalledWith({ alt: 'pic.png', url: expect.any(String) });

			cleanup();
		});

		it('links a dropped non-image file instead of embedding it', () => {
			const { component, handleFileList$ } = buildFixture();
			handleFileList$.mockReturnValue(of([{ result: { updatedFile: { id: 'file-4', kind: 'file', publicFilename: 'notes.pdf' } } }]));
			const { cleanup } = loadEditor(component);
			const insertFileAsLink = vi.spyOn(component, 'insertFileAsLink');

			dropOnEditor(component, [new File(['x'], 'notes.pdf', { type: 'application/pdf' })]);

			expect(insertFileAsLink).toHaveBeenCalled();

			cleanup();
		});

		it('ignores a drop that carries no file', () => {
			const { component, handleFileList$ } = buildFixture();
			const { cleanup } = loadEditor(component);

			dropOnEditor(component, []);

			expect(handleFileList$).not.toHaveBeenCalled();

			cleanup();
		});
	});

	it('exposes convertToUrl to the template', () => {
		const { component } = buildFixture();

		expect(component.convertToUrl).toBe(convertToUrl);
	});
});
