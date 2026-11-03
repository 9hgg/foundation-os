import Quill from 'quill';
import { DefaultTheme, Font } from './default.theme.quill';

// Registered as 'spoken' -- the name the blocks that use it register it under.
Quill.register('themes/spoken', DefaultTheme, true);

/** The toolbar the theme understands: one control of every kind it builds a picker for. */
const TOOLBAR_HTML = `
	<span class="ql-formats">
		<select class="ql-header"></select>
		<select class="ql-font"></select>
		<select class="ql-size"></select>
		<select class="ql-align"></select>
		<select class="ql-color"></select>
		<select class="ql-background"></select>
		<button class="ql-bold"></button>
		<button class="ql-link"></button>
	</span>
`;

describe('DefaultTheme', () => {
	// Quill measures the caret and the tooltip through geometry jsdom does not implement.
	beforeAll(() => {
		Range.prototype.getBoundingClientRect = () => new DOMRect();
		Range.prototype.getClientRects = () => Object.assign([], { item: () => null });
	});

	const mounted: HTMLElement[] = [];

	/** Quill replaces each toolbar <select> with a <span class="ql-<format> ql-picker">. */
	const pickerOf = (toolbar: HTMLElement | undefined, format: string) => toolbar?.querySelector<HTMLElement>(`.ql-${format}.ql-picker`);
	const pickerItems = (toolbar: HTMLElement | undefined, format: string) => pickerOf(toolbar, format)?.querySelectorAll('.ql-picker-item').length;

	const buildEditor = (options: { withToolbar?: boolean } = {}) => {
		const host = document.createElement('div');
		document.body.appendChild(host);
		mounted.push(host);

		let toolbar: HTMLElement | undefined;
		if (options.withToolbar !== false) {
			toolbar = document.createElement('div');
			toolbar.innerHTML = TOOLBAR_HTML;
			document.body.appendChild(toolbar);
			mounted.push(toolbar);
		}

		const quill = new Quill(host, { theme: 'spoken', modules: toolbar ? { toolbar } : { toolbar: true } });
		return { quill, host, toolbar };
	};

	afterEach(() => {
		mounted.splice(0).forEach((element) => element.remove());
	});

	it('exports the font attributor the toolbar formats with', () => {
		expect(Font).toBeDefined();
		expect(Font.attrName ?? Font.keyName).toBeTruthy();
	});

	it('marks the editor as a snow-styled one, since it reuses those styles', () => {
		const { quill } = buildEditor();

		expect(quill.container.classList.contains('ql-snow')).toBe(true);
	});

	// The container is left unset when a caller asks for a toolbar without saying which one.
	it('falls back to its own toolbar layout when the caller names no container', () => {
		const { quill } = buildEditor({ withToolbar: false });
		const toolbar = quill.getModule('toolbar') as { container: HTMLElement };

		expect(toolbar.container.querySelector('.ql-bold')).not.toBeNull();
		expect(toolbar.container.querySelector('.ql-link')).not.toBeNull();
		expect(toolbar.container.classList.contains('ql-snow')).toBe(true);
	});

	describe('the pickers it builds', () => {
		it('offers a value per choice for the header, font and size pickers', () => {
			const { toolbar } = buildEditor();

			expect(pickerItems(toolbar, 'header')).toBe(4);
			expect(pickerItems(toolbar, 'font')).toBe(3);
			expect(pickerItems(toolbar, 'size')).toBe(4);
		});

		it('turns the align picker into an icon picker, one icon per alignment', () => {
			const { toolbar } = buildEditor();

			expect(pickerItems(toolbar, 'align')).toBe(4);
			expect(pickerOf(toolbar, 'align')?.classList.contains('ql-icon-picker')).toBe(true);
		});

		it('gives the colour pickers a swatch grid, a primary row and a native colour input', () => {
			const { toolbar } = buildEditor();
			const colorPicker = pickerOf(toolbar, 'color');

			expect(pickerItems(toolbar, 'color')).toBeGreaterThan(7);
			expect(colorPicker?.classList.contains('ql-color-picker')).toBe(true);
			expect(colorPicker?.querySelectorAll('.ql-picker-item.ql-primary').length).toBe(7);
			expect(colorPicker?.querySelector('input.ql-color-input')?.getAttribute('type')).toBe('color');
		});

		it('marks a default swatch as the selected one in each colour picker', () => {
			const { toolbar } = buildEditor();

			expect(pickerOf(toolbar, 'color')?.querySelector('.ql-picker-item.ql-selected')).not.toBeNull();
			expect(pickerOf(toolbar, 'background')?.querySelector('.ql-picker-item.ql-selected')).not.toBeNull();
		});

		it('paints each swatch with the colour it stands for', () => {
			const { toolbar } = buildEditor();
			const item = pickerOf(toolbar, 'color')?.querySelector<HTMLElement>('.ql-picker-item[data-value="#e60000"]');

			expect(item?.style.backgroundColor).toBe('rgb(230, 0, 0)');
		});

		it('leaves a select the author already filled alone', () => {
			const host = document.createElement('div');
			const toolbar = document.createElement('div');
			toolbar.innerHTML = '<span class="ql-formats"><select class="ql-header"><option value="1"></option></select></span>';
			document.body.append(host, toolbar);
			mounted.push(host, toolbar);

			new Quill(host, { theme: 'spoken', modules: { toolbar } });

			expect(pickerItems(toolbar, 'header')).toBe(1);
		});
	});

	describe('the colour input', () => {
		const colorInputOf = (toolbar: HTMLElement | undefined, format: 'color' | 'background') =>
			pickerOf(toolbar, format)?.querySelector<HTMLInputElement>('input.ql-color-input');

		it('formats the selection with the colour picked, as the text colour or the background', () => {
			const { quill, toolbar } = buildEditor();
			quill.setText('hello');
			quill.setSelection(0, 5);
			const format = vi.spyOn(quill, 'format');

			const textInput = colorInputOf(toolbar, 'color')!;
			textInput.value = '#123456';
			textInput.dispatchEvent(new Event('input'));
			expect(format).toHaveBeenCalledWith('color', '#123456', expect.anything());

			const backgroundInput = colorInputOf(toolbar, 'background')!;
			backgroundInput.value = '#654321';
			backgroundInput.dispatchEvent(new Event('input'));
			expect(format).toHaveBeenCalledWith('background', '#654321', expect.anything());
		});

		it('closes the picker once the colour is settled, by mouse or by touch', () => {
			const { toolbar } = buildEditor();
			const picker = pickerOf(toolbar, 'color');
			const input = colorInputOf(toolbar, 'color')!;

			picker?.querySelector<HTMLElement>('.ql-picker-label')?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
			expect(picker?.classList.contains('ql-expanded')).toBe(true);

			input.dispatchEvent(new Event('mouseup'));
			expect(picker?.classList.contains('ql-expanded')).toBe(false);

			picker?.querySelector<HTMLElement>('.ql-picker-label')?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
			input.dispatchEvent(new Event('touchend'));
			expect(picker?.classList.contains('ql-expanded')).toBe(false);
		});

		it('shows itself only while the picker is open', () => {
			const { toolbar } = buildEditor();
			const picker = pickerOf(toolbar, 'color');
			const inputContainer = picker?.querySelector<HTMLElement>('.ql-color-input-container');

			expect(inputContainer?.style.display).toBe('none');

			picker?.querySelector<HTMLElement>('.ql-picker-label')?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
			expect(inputContainer?.style.display).toBe('block');
		});

		it('follows the colour of whatever the caret is in', () => {
			const { quill, toolbar } = buildEditor();
			quill.setText('hello');
			quill.formatText(0, 5, 'color', '#abcdef');

			quill.setSelection(1, 0, 'user');

			expect(colorInputOf(toolbar, 'color')?.value).toBe('#abcdef');
		});

		it('shows black for text carrying no colour of its own', () => {
			const { quill, toolbar } = buildEditor();
			quill.setText('hello');

			quill.setSelection(1, 0, 'user');

			expect(colorInputOf(toolbar, 'color')?.value).toBe('#000000');
		});
	});

	describe('picking a swatch', () => {
		it('paints the toolbar label with the chosen colour', () => {
			const { quill, toolbar } = buildEditor();
			quill.setText('hello');
			quill.setSelection(0, 5);
			const picker = pickerOf(toolbar, 'color');

			picker?.querySelector<HTMLElement>('.ql-picker-item[data-value="#e60000"]')?.click();

			const label = picker?.querySelector<HTMLElement>('.ql-color-label');
			expect(label?.style.fill || label?.style.stroke).toBeTruthy();
		});
	});

	describe('the link tooltip', () => {
		const tooltipOf = (quill: Quill) => (quill.theme as unknown as { tooltip: { root: HTMLElement } }).tooltip;

		it('is built with a preview, an action and a remove control', () => {
			const { quill } = buildEditor();
			const root = tooltipOf(quill).root;

			expect(root.querySelector('a.ql-preview')).not.toBeNull();
			expect(root.querySelector('a.ql-action')).not.toBeNull();
			expect(root.querySelector('a.ql-remove')).not.toBeNull();
		});

		it('shows the link the caret is sitting in, and its address', () => {
			const { quill } = buildEditor();
			quill.setText('hello');
			quill.formatText(0, 5, 'link', 'https://example.test');

			quill.setSelection(2, 0, 'user');

			const root = tooltipOf(quill).root;
			expect(root.querySelector('a.ql-preview')?.textContent).toBe('https://example.test');
			expect(root.querySelector('a.ql-preview')?.getAttribute('href')).toBe('https://example.test');
			expect(root.classList.contains('ql-hidden')).toBe(false);
		});

		it('hides again once the caret leaves the link', () => {
			const { quill } = buildEditor();
			quill.setText('hello world');
			quill.formatText(0, 5, 'link', 'https://example.test');
			quill.setSelection(2, 0, 'user');

			quill.setSelection(8, 0, 'user');

			expect(tooltipOf(quill).root.classList.contains('ql-hidden')).toBe(true);
		});

		it('stays hidden while text is selected rather than a caret placed', () => {
			const { quill } = buildEditor();
			quill.setText('hello');
			quill.formatText(0, 5, 'link', 'https://example.test');

			quill.setSelection(0, 5, 'user');

			expect(tooltipOf(quill).root.classList.contains('ql-hidden')).toBe(true);
		});

		it('opens for editing when the action is clicked, and saves and closes on the second', () => {
			const { quill } = buildEditor();
			quill.setText('hello');
			quill.formatText(0, 5, 'link', 'https://example.test');
			quill.setSelection(2, 0, 'user');
			const root = tooltipOf(quill).root;

			root.querySelector<HTMLElement>('a.ql-action')?.click();
			expect(root.classList.contains('ql-editing')).toBe(true);
			expect(root.querySelector<HTMLInputElement>('input')?.value).toBe('https://example.test');

			root.querySelector<HTMLElement>('a.ql-action')?.click();
			// ql-editing is only cleared on the next show(); saving hides the tooltip.
			expect(root.classList.contains('ql-hidden')).toBe(true);
		});

		it('takes the link off the text when remove is clicked', () => {
			const { quill } = buildEditor();
			quill.setText('hello');
			quill.formatText(0, 5, 'link', 'https://example.test');
			quill.setSelection(2, 0, 'user');

			tooltipOf(quill).root.querySelector<HTMLElement>('a.ql-remove')?.click();

			expect(quill.getFormat(0, 5)['link']).toBeUndefined();
			expect(tooltipOf(quill).root.classList.contains('ql-hidden')).toBe(true);
		});

		it('removing with nothing selected is a no-op', () => {
			const { quill } = buildEditor();

			expect(() => tooltipOf(quill).root.querySelector<HTMLElement>('a.ql-remove')?.click()).not.toThrow();
		});
	});

	describe('the link toolbar handler', () => {
		/** The theme's own cmd-k binding calls the handler with the toolbar as `this`. */
		const callLinkHandler = (quill: Quill, value: unknown) => {
			const toolbar = quill.getModule('toolbar') as { handlers: Record<string, (value: unknown) => void> };
			toolbar.handlers['link'].call(toolbar, value);
		};

		it('offers the selected text as the address to link to', () => {
			const { quill } = buildEditor();
			quill.setText('https://example.test');
			quill.setSelection(0, 20);
			const tooltip = quill.theme as unknown as { tooltip: { edit: (mode: string, preview: string) => void } };
			const edit = vi.spyOn(tooltip.tooltip, 'edit');

			callLinkHandler(quill, true);

			expect(edit).toHaveBeenCalledWith('link', 'https://example.test');
		});

		it('turns a selected address into a mailto link', () => {
			const { quill } = buildEditor();
			quill.setText('ada@example.test');
			quill.setSelection(0, 16);
			const tooltip = quill.theme as unknown as { tooltip: { edit: (mode: string, preview: string) => void } };
			const edit = vi.spyOn(tooltip.tooltip, 'edit');

			callLinkHandler(quill, true);

			expect(edit).toHaveBeenCalledWith('link', 'mailto:ada@example.test');
		});

		it('does nothing with no text selected', () => {
			const { quill } = buildEditor();
			quill.setText('hello');
			quill.setSelection(2, 0);
			const tooltip = quill.theme as unknown as { tooltip: { edit: (mode: string, preview: string) => void } };
			const edit = vi.spyOn(tooltip.tooltip, 'edit');

			callLinkHandler(quill, true);

			expect(edit).not.toHaveBeenCalled();
		});

		it('unlinks the selection when called with nothing to link to', () => {
			const { quill } = buildEditor();
			quill.setText('hello');
			quill.formatText(0, 5, 'link', 'https://example.test');
			quill.setSelection(0, 5);

			callLinkHandler(quill, false);

			expect(quill.getFormat(0, 5)['link']).toBeUndefined();
		});

		it('is bound to a key of its own when the toolbar offers a link button', () => {
			const withLink = buildEditor();
			const bindingsWithLink = (withLink.quill.keyboard as unknown as { bindings: Record<string, unknown[]> }).bindings;

			expect(bindingsWithLink['k']?.length).toBeGreaterThan(0);
		});

		it('binds nothing when the toolbar has no link button', () => {
			const host = document.createElement('div');
			const toolbar = document.createElement('div');
			toolbar.innerHTML = '<span class="ql-formats"><button class="ql-bold"></button></span>';
			document.body.append(host, toolbar);
			mounted.push(host, toolbar);

			const quill = new Quill(host, { theme: 'spoken', modules: { toolbar } });
			const bindings = (quill.keyboard as unknown as { bindings: Record<string, unknown[]> }).bindings;

			expect(bindings['k']).toBeUndefined();
		});
	});
});
