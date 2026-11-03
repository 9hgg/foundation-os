import { TestBed } from '@angular/core/testing';
import { QuillService } from '@foundation/quill/utils';
import type Quill from 'quill';
import { QuillTextareaComponent } from './quill-textarea.component';

describe('QuillTextareaComponent', () => {
	/** A stand-in for the editor the service hands back: enough of Quill for the component's use. */
	const buildFakeQuill = () => {
		const root = document.createElement('div');
		return {
			root,
			clipboard: { dangerouslyPasteHTML: vi.fn((html: string) => (root.innerHTML = html)) },
			getContents: () => ({ ops: [] }),
		} as unknown as Quill;
	};

	const buildFixture = () => {
		const quill = buildFakeQuill();
		let onTextChange: ((details: { semanticHTML: string }) => void) | undefined;
		const loadQuill = vi.fn((_id, _content, _element, callback) => {
			onTextChange = callback;
			return quill;
		});
		const clearQuill = vi.fn();

		TestBed.configureTestingModule({ providers: [{ provide: QuillService, useValue: { loadQuill, clearQuill } }] });
		TestBed.overrideComponent(QuillTextareaComponent, { set: { template: '<div #quillContainer></div>', imports: [], styles: [] } });

		const fixture = TestBed.createComponent(QuillTextareaComponent);
		fixture.detectChanges();

		return { fixture, component: fixture.componentInstance, quill, loadQuill, clearQuill, textChange: (html: string) => onTextChange?.({ semanticHTML: html }) };
	};

	afterEach(() => TestBed.resetTestingModule());

	it('loads an editor into its own container, with a generic toolbar', () => {
		const { component, loadQuill } = buildFixture();

		expect(component.quill).not.toBeNull();
		// A null quillId means the service builds its own toolbar rather than looking for one on the page.
		expect(loadQuill).toHaveBeenCalledWith(null, null, expect.any(HTMLElement), expect.any(Function));
	});

	it('pastes the html it was given in as the starting content', () => {
		const quill = buildFakeQuill();
		const loadQuill = vi.fn(() => quill);
		TestBed.configureTestingModule({ providers: [{ provide: QuillService, useValue: { loadQuill, clearQuill: vi.fn() } }] });
		TestBed.overrideComponent(QuillTextareaComponent, { set: { template: '<div #quillContainer></div>', imports: [], styles: [] } });
		const fixture = TestBed.createComponent(QuillTextareaComponent);
		fixture.componentRef.setInput('html', '<p>hello</p>');
		fixture.detectChanges();

		expect(quill.clipboard.dangerouslyPasteHTML).toHaveBeenCalledWith('<p>hello</p>');
	});

	it('starts an empty editor without pasting anything', () => {
		const { quill } = buildFixture();

		expect(quill.clipboard.dangerouslyPasteHTML).not.toHaveBeenCalled();
	});

	// Every keystroke would otherwise write back through the model, and the write loops round again.
	it('publishes an edit only once the typing settles', () => {
		vi.useFakeTimers();
		const { component, textChange } = buildFixture();

		textChange('<p>partial</p>');
		expect(component.html()).toBe('');

		vi.advanceTimersByTime(500);
		expect(component.html()).toBe('<p>partial</p>');

		vi.useRealTimers();
	});

	it('publishes only the last of a burst of edits', () => {
		vi.useFakeTimers();
		const { component, textChange } = buildFixture();

		textChange('<p>one</p>');
		vi.advanceTimersByTime(100);
		textChange('<p>two</p>');
		vi.advanceTimersByTime(500);

		expect(component.html()).toBe('<p>two</p>');

		vi.useRealTimers();
	});

	it('pastes html that came from outside into the editor', () => {
		const { fixture, quill } = buildFixture();

		fixture.componentRef.setInput('html', '<p>from outside</p>');
		fixture.detectChanges();

		expect(quill.clipboard.dangerouslyPasteHTML).toHaveBeenCalledWith('<p>from outside</p>');
	});

	it('does not paste back the html the editor itself just reported', () => {
		vi.useFakeTimers();
		const { fixture, quill, textChange } = buildFixture();
		quill.root.innerHTML = '<p>typed</p>';

		textChange('<p>typed</p>');
		vi.advanceTimersByTime(500);
		fixture.detectChanges();

		expect(quill.clipboard.dangerouslyPasteHTML).not.toHaveBeenCalled();
		vi.useRealTimers();
	});

	describe('the raw html mode', () => {
		it('is off to begin with, and toggles', () => {
			const { component } = buildFixture();

			expect(component.isRawHtmlMode()).toBe(false);

			component.toggleEditorMode();
			expect(component.isRawHtmlMode()).toBe(true);

			component.toggleEditorMode();
			expect(component.isRawHtmlMode()).toBe(false);
		});

		it('hands the editor content over as html, and tears the editor down', () => {
			const { fixture, component, clearQuill, quill } = buildFixture();
			quill.root.innerHTML = '<p>typed</p>';

			component.toggleEditorMode();
			fixture.detectChanges();

			expect(component.html()).toBe('<p>typed</p>');
			expect(clearQuill).toHaveBeenCalledWith(quill);
			expect(component.quill).toBeNull();
		});

		it('builds a fresh editor on the way back', () => {
			const { fixture, component, loadQuill } = buildFixture();
			component.toggleEditorMode();
			fixture.detectChanges();

			component.toggleEditorMode();
			fixture.detectChanges();

			expect(loadQuill).toHaveBeenCalledTimes(2);
			expect(component.quill).not.toBeNull();
		});
	});

	describe('the mode toggle button', () => {
		it('is hidden unless the caller asks for it', () => {
			const { component } = buildFixture();

			expect(component.isToggleVisible()).toBe(false);
		});

		it('is shown when the caller asks for it', () => {
			const { fixture, component } = buildFixture();

			fixture.componentRef.setInput('showEditorToggle', true);
			fixture.detectChanges();

			expect(component.isToggleVisible()).toBe(true);
		});

		// Holding shift reveals the escape hatch without putting a button in everyone's way.
		it('is revealed by pressing shift, and stays revealed', () => {
			const { component } = buildFixture();

			document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Shift' }));
			expect(component.isToggleVisible()).toBe(true);
		});

		it('ignores any other key', () => {
			const { component } = buildFixture();

			document.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }));

			expect(component.isToggleVisible()).toBe(false);
		});

		it('stays hidden on shift when the caller disabled the shortcut', () => {
			const { fixture, component } = buildFixture();
			fixture.componentRef.setInput('disableShit', true);
			fixture.detectChanges();

			document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Shift' }));

			expect(component.isToggleVisible()).toBe(false);
		});
	});

	it('tears the editor down when it goes away', () => {
		const { component, clearQuill, quill } = buildFixture();

		component.ngOnDestroy();

		expect(clearQuill).toHaveBeenCalledWith(quill);
	});

	it('destroying without an editor is a no-op', () => {
		const { fixture, component, clearQuill } = buildFixture();
		component.toggleEditorMode();
		fixture.detectChanges();
		clearQuill.mockClear();

		component.ngOnDestroy();

		expect(clearQuill).not.toHaveBeenCalled();
	});
});
