import { merge } from 'lodash-es';
import type { ClassAttributor } from 'parchment';
import Quill from 'quill';
import Emitter from 'quill/core/emitter.js';
import { Range } from 'quill/core/selection.js';
import type { ThemeOptions } from 'quill/core/theme.js';
import LinkBlot from 'quill/formats/link.js';
import type { Context } from 'quill/modules/keyboard.js';
import type Toolbar from 'quill/modules/toolbar.js';
import type { ToolbarConfig } from 'quill/modules/toolbar.js';
import BaseTheme, { BaseTooltip } from 'quill/themes/base.js';
import IconPicker from 'quill/ui/icon-picker.js';
import icons from 'quill/ui/icons.js';
import Picker from 'quill/ui/picker.js';

const ALIGNS = [false, 'center', 'right', 'justify'];

const COLORS = [
	// transparent
	'transparent',
	'#000000',
	'#e60000',
	'#ff9900',
	'#ffff00',
	'#008a00',
	'#0066cc',
	'#9933ff',
	'#ffffff',
	'#facccc',
	'#ffebcc',
	'#ffffcc',
	'#cce8cc',
	'#cce0f5',
	'#ebd6ff',
	'#bbbbbb',
	'#f06666',
	'#ffc266',
	'#ffff66',
	'#66b966',
	'#66a3e0',
	'#c285ff',
	'#888888',
	'#a10000',
	'#b26b00',
	'#b2b200',
	'#006100',
	'#0047b2',
	'#6b24b2',
	'#444444',
	'#5c0000',
	'#663d00',
	'#666600',
	'#003700',
	'#002966',
	'#3d1466',
];

const FONTS = [false, 'serif', 'monospace'];

// Add fonts to whitelist
export const Font: ClassAttributor = Quill.import('formats/font') as ClassAttributor;
Font.whitelist = FONTS.slice(1) as string[];

Quill.register('formats/font', Font, true);

const HEADERS = ['1', '2', '3', false];

const SIZES = ['small', false, 'large', 'huge'];

const TOOLBAR_CONFIG: ToolbarConfig = [[{ header: ['1', '2', '3', false] }], ['bold', 'italic', 'underline', 'link'], [{ list: 'ordered' }, { list: 'bullet' }], ['clean']];

function fillSelect(select: HTMLSelectElement, values: Array<string | boolean>, defaultValue: unknown = false) {
	values.forEach((value) => {
		const option = document.createElement('option');
		if (value === defaultValue) {
			option.setAttribute('selected', 'selected');
		} else {
			option.setAttribute('value', String(value));
		}
		select.appendChild(option);
	});
}

class ColorPicker extends Picker {
	quill: Quill;
	inputContainer?: HTMLDivElement;
	colorInput?: HTMLInputElement;

	constructor(select: HTMLSelectElement, label: string, quill: Quill) {
		super(select);
		this.quill = quill;
		this.label.innerHTML = label;
		this.container.classList.add('ql-color-picker');
		Array.from(this.container.querySelectorAll('.ql-picker-item'))
			.slice(0, 7)
			.forEach((item) => {
				item.classList.add('ql-primary');
			});
		this.addColorInput();
		this.quill.on(Emitter.events.SELECTION_CHANGE, this.updatePicker.bind(this));
	}

	override buildItem(option: HTMLOptionElement) {
		const item = super.buildItem(option);
		item.style.backgroundColor = option.getAttribute('value') || '';
		return item;
	}

	override selectItem(item: HTMLElement | null, trigger?: boolean) {
		super.selectItem(item, trigger);
		const colorLabel = this.label.querySelector<HTMLElement>('.ql-color-label');
		const value = item ? item.getAttribute('data-value') || '' : '';
		if (colorLabel) {
			if (colorLabel.tagName === 'line') {
				colorLabel.style.stroke = value;
			} else {
				colorLabel.style.fill = value;
			}
		}
		this.updateToolbarColor(value);
	}

	override togglePicker() {
		super.togglePicker();
		if (this.inputContainer) {
			this.inputContainer.style.display = this.container.classList.contains('ql-expanded') ? 'block' : 'none';
		}
	}

	addColorInput() {
		this.inputContainer = document.createElement('div');
		this.inputContainer.classList.add('ql-color-input-container');
		this.inputContainer.style.display = 'none';
		this.inputContainer.style.cssFloat = 'right';
		this.colorInput = document.createElement('input');
		this.colorInput.setAttribute('type', 'color');
		this.colorInput.classList.add('ql-color-input');
		this.colorInput.addEventListener('input', (event) => {
			const colorValue = (event.target as HTMLInputElement).value;
			// @ts-expect-error Fix me later
			const formatType = this.options.parentElement?.classList.contains('ql-background') ? 'background' : 'color';
			this.quill.format(formatType, colorValue, Quill.sources.USER);
			this.updateToolbarColor(colorValue);
		});
		this.colorInput.addEventListener('mouseup', () => {
			this.close();
		});
		this.colorInput.addEventListener('touchend', () => {
			this.close();
		});
		this.inputContainer.appendChild(this.colorInput);
		// @ts-expect-error Fix me later
		this.options.appendChild(this.inputContainer); // Append within the options container
	}

	override close() {
		super.close();
		if (this.inputContainer) this.inputContainer.style.display = 'none';
	}

	updatePicker() {
		// @ts-expect-error Fix me later
		const formatType = this.options.parentElement?.classList.contains('ql-background') ? 'background' : 'color';
		const currentValue = this.quill.getFormat()[formatType] || '';
		if (this.colorInput) {
			// @ts-expect-error Fix me later
			this.colorInput.value = currentValue || '#000000';
		}
		// @ts-expect-error Fix me later
		this.updateToolbarColor(currentValue);
	}

	updateToolbarColor(value: string) {
		const colorLabel = this.label.querySelector<HTMLElement>('.ql-color-label');
		if (colorLabel) {
			if (colorLabel.tagName === 'line') {
				colorLabel.style.stroke = value;
			} else {
				colorLabel.style.fill = value;
			}
		}
	}
}

// class ColorPickerNew extends Picker {
// 	options!: HTMLSpanElement;
// 	quill: Quill;
// 	inputContainer?: HTMLDivElement;
// 	colorInput?: HTMLInputElement;

// 	constructor(select: HTMLSelectElement, label: string, quill: Quill) {
// 		super(select);
// 		this.quill = quill;
// 		console.log('Building ColorPicker, container:', this.container);

// 		this.label.innerHTML = label;
// 		this.container.classList.add('ql-color-picker');
// 		Array.from(this.container.querySelectorAll('.ql-picker-item'))
// 			.slice(0, 7)
// 			.forEach((item) => {
// 				item.classList.add('ql-primary');
// 			});
// 		// this.addColorInput();
// 	}

// 	override buildOptions() {
// 		const options = document.createElement('span');
// 		options.classList.add('ql-picker-options');

// 		// Don't want screen readers to read this until options are visible
// 		options.setAttribute('aria-hidden', 'true');
// 		options.tabIndex = -1;

// 		// Need a unique id for aria-controls
// 		options.id = `ql-picker-options-${optionsCounter}`;
// 		optionsCounter += 1;
// 		this.label.setAttribute('aria-controls', options.id);

// 		this.options = options;

// 		Array.from(this.select.options).forEach((option) => {
// 			const item = this.buildItem(option);
// 			options.appendChild(item);
// 			if (option.selected === true) {
// 				this.selectItem(item);
// 			}
// 		});
// 		this.container.appendChild(options);
// 	}

// 	override buildItem(option: HTMLOptionElement) {
// 		const item = super.buildItem(option);
// 		item.style.backgroundColor = option.getAttribute('value') || '';
// 		return item;
// 	}

// 	override selectItem(item: HTMLElement | null, trigger?: boolean) {
// 		super.selectItem(item, trigger);

// 		// snippet to fill adapt the color of the label in the toolbar
// 		const colorLabel = this.label.querySelector<HTMLElement>('.ql-color-label');
// 		const value = item ? item.getAttribute('data-value') || '' : '';
// 		if (colorLabel) {
// 			if (colorLabel.tagName === 'line') {
// 				colorLabel.style.stroke = value;
// 			} else {
// 				colorLabel.style.fill = value;
// 			}
// 		}
// 	}

// 	addColorInput() {
// 		// this.inputContainer = document.createElement('div');
// 		// this.inputContainer.classList.add('ql-color-input-container');
// 		// this.inputContainer.style.display = 'none';
// 		// this.colorInput = document.createElement('input');
// 		// this.colorInput.setAttribute('type', 'color');
// 		// this.colorInput.classList.add('ql-color-input');
// 		// this.colorInput.addEventListener('input', (event) => {
// 		// 	const colorValue = (event.target as HTMLInputElement).value;
// 		// 	this.quill.format('color', colorValue, Quill.sources.USER);
// 		// });
// 		// this.colorInput.addEventListener('mouseup', () => {
// 		// 	this.close();
// 		// });
// 		// this.colorInput.addEventListener('touchend', () => {
// 		// 	this.close();
// 		// });
// 		// this.inputContainer.appendChild(this.colorInput);
// 		// this.container.appendChild(this.inputContainer);
// 	}

// 	// override close() {
// 	// 	super.close();
// 	// 	if (this.inputContainer) this.inputContainer.style.display = 'none';
// 	// }

// 	override togglePicker() {
// 		super.togglePicker();
// 		if (this.inputContainer)
// 			this.inputContainer.style.display = this.container.classList.contains('ql-expanded') ? 'block' : 'none';
// 	}
// }
// class ColorPickerOld2 extends Picker {
// 	options!: HTMLSpanElement;
// 	quill: Quill;

// 	constructor(select: HTMLSelectElement, label: string, quill: Quill) {
// 		super(select);
// 		this.quill = quill;
// 		console.log('Building ColorPicker, container:', this.container);
// 		this.label.innerHTML = label;
// 		this.container.classList.add('ql-color-picker');
// 		Array.from(this.container.querySelectorAll('.ql-picker-item'))
// 			.slice(0, 7)
// 			.forEach((item) => {
// 				item.classList.add('ql-primary');
// 			});
// 		this.addColorInput();
// 	}

// 	override buildOptions() {
// 		const options = document.createElement('span');
// 		options.classList.add('ql-picker-options');
// 		options.setAttribute('aria-hidden', 'true');
// 		options.tabIndex = -1;
// 		options.id = `ql-picker-options-${optionsCounter}`;
// 		optionsCounter += 1;
// 		this.label.setAttribute('aria-controls', options.id);
// 		this.options = options;
// 		Array.from(this.select.options).forEach((option) => {
// 			const item = this.buildItem(option);
// 			options.appendChild(item);
// 			if (option.selected === true) {
// 				this.selectItem(item);
// 			}
// 		});
// 		this.container.appendChild(options);
// 	}

// 	override buildItem(option: HTMLOptionElement) {
// 		const item = super.buildItem(option);
// 		item.style.backgroundColor = option.getAttribute('value') || '';
// 		return item;
// 	}

// 	override selectItem(item: HTMLElement | null, trigger?: boolean) {
// 		super.selectItem(item, trigger);
// 		const colorLabel = this.label.querySelector<HTMLElement>('.ql-color-label');
// 		const value = item ? item.getAttribute('data-value') || '' : '';
// 		if (colorLabel) {
// 			if (colorLabel.tagName === 'line') {
// 				colorLabel.style.stroke = value;
// 			} else {
// 				colorLabel.style.fill = value;
// 			}
// 		}
// 	}

// 	addColorInput() {
// 		const inputContainer = document.createElement('div');
// 		inputContainer.classList.add('ql-color-input-container');

// 		const colorInput = document.createElement('input');
// 		colorInput.setAttribute('type', 'color');
// 		colorInput.classList.add('ql-color-input');

// 		colorInput.addEventListener('input', (event) => {
// 			const colorValue = (event.target as HTMLInputElement).value;
// 			this.quill.format('color', colorValue, Quill.sources.USER);
// 		});

// 		inputContainer.appendChild(colorInput);
// 		this.container.appendChild(inputContainer);
// 	}
// }
// class ColorPickerOld3 extends Picker {
// 	options!: HTMLSpanElement;
// 	inputContainer!: HTMLDivElement;
// 	colorInput!: HTMLInputElement;
// 	quill: Quill;

// 	constructor(select: HTMLSelectElement, label: string, quill: Quill) {
// 		super(select);
// 		this.quill = quill;
// 		console.log('Building ColorPicker 3, container:', this.container);
// 		this.label.innerHTML = label;
// 		this.container.classList.add('ql-color-picker');
// 		Array.from(this.container.querySelectorAll('.ql-picker-item'))
// 			.slice(0, 7)
// 			.forEach((item) => {
// 				item.classList.add('ql-primary');
// 			});
// 		this.addColorInput();
// 	}

// 	// override buildOptions() {
// 	// 	const options = document.createElement('span');
// 	// 	options.classList.add('ql-picker-options');
// 	// 	options.setAttribute('aria-hidden', 'true');
// 	// 	options.tabIndex = -1;
// 	// 	options.id = `ql-picker-options-${optionsCounter}`;
// 	// 	optionsCounter += 1;
// 	// 	this.label.setAttribute('aria-controls', options.id);
// 	// 	this.options = options;
// 	// 	Array.from(this.select.options).forEach((option) => {
// 	// 		const item = this.buildItem(option);
// 	// 		options.appendChild(item);
// 	// 		if (option.selected === true) {
// 	// 			this.selectItem(item);
// 	// 		}
// 	// 	});
// 	// 	this.container.appendChild(options);
// 	// }

// 	override togglePicker() {
// 		super.togglePicker();
// 		this.inputContainer.style.display = this.container.classList.contains('ql-expanded') ? 'block' : 'none';
// 	}

// 	addColorInput() {
// 		this.inputContainer = document.createElement('div');
// 		this.inputContainer.classList.add('ql-color-input-container');
// 		this.inputContainer.style.display = 'none';

// 		this.colorInput = document.createElement('input');
// 		this.colorInput.setAttribute('type', 'color');
// 		this.colorInput.classList.add('ql-color-input');

// 		this.colorInput.addEventListener('input', (event) => {
// 			const colorValue = (event.target as HTMLInputElement).value;
// 			this.quill.format('color', colorValue, Quill.sources.USER);
// 		});

// 		this.colorInput.addEventListener('mouseup', () => {
// 			this.close();
// 		});

// 		this.colorInput.addEventListener('touchend', () => {
// 			this.close();
// 		});

// 		this.inputContainer.appendChild(this.colorInput);
// 		this.container.appendChild(this.inputContainer);
// 	}

// 	override close() {
// 		super.close();
// 		this.inputContainer.style.display = 'none';
// 	}

// 	override selectItem(item: HTMLElement | null, trigger = false) {
// 		super.selectItem(item, trigger);
// 		const colorLabel = this.label.querySelector<HTMLElement>('.ql-color-label');
// 		const value = item ? item.getAttribute('data-value') || '' : '';
// 		if (colorLabel) {
// 			if (colorLabel.tagName === 'line') {
// 				colorLabel.style.stroke = value;
// 			} else {
// 				colorLabel.style.fill = value;
// 			}
// 		}
// 	}
// }

class SpokenTooltip extends BaseTooltip {
	static TEMPLATE = ['<a class="ql-preview" rel="noopener noreferrer" target="_blank" href="about:blank"></a>', '<input type="text" data-formula="e=mc^2" data-link="https://quilljs.com" data-video="Embed URL">', '<a class="ql-action"></a>', '<a class="ql-remove"></a>'].join('');

	preview = this.root.querySelector('a.ql-preview');

	override listen() {
		super.listen();
		// @ts-expect-error Fix me later
		this.root.querySelector('a.ql-action').addEventListener('click', (event) => {
			if (this.root.classList.contains('ql-editing')) {
				this.save();
			} else {
				// @ts-expect-error Fix me later
				this.edit('link', this.preview.textContent);
			}
			event.preventDefault();
		});
		// @ts-expect-error Fix me later
		this.root.querySelector('a.ql-remove').addEventListener('click', (event) => {
			if (this.linkRange != null) {
				const range = this.linkRange;
				this.restoreFocus();
				this.quill.formatText(range, 'link', false, Emitter.sources.USER);
				delete this.linkRange;
			}
			event.preventDefault();
			this.hide();
		});
		this.quill.on(Emitter.events.SELECTION_CHANGE, (range, oldRange, source) => {
			if (range == null) return;
			if (range.length === 0 && source === Emitter.sources.USER) {
				const [link, offset] = this.quill.scroll.descendant(LinkBlot, range.index);
				if (link != null) {
					this.linkRange = new Range(range.index - offset, link.length());
					const preview = LinkBlot.formats(link.domNode);
					// @ts-expect-error Fix me later
					this.preview.textContent = preview;
					// @ts-expect-error Fix me later
					this.preview.setAttribute('href', preview);
					this.show();
					const bounds = this.quill.getBounds(this.linkRange);
					if (bounds != null) {
						this.position(bounds);
					}
					return;
				}
			} else {
				delete this.linkRange;
			}
			this.hide();
		});
	}

	override show() {
		super.show();
		this.root.removeAttribute('data-mode');
	}
}

export class SpokenTheme extends BaseTheme {
	constructor(quill: Quill, options: ThemeOptions) {
		console.log('Building SpokenTheme');

		if (options.modules.toolbar != null && options.modules.toolbar.container == null) {
			console.log('Setting toolbar container');

			options.modules.toolbar.container = TOOLBAR_CONFIG;
		}
		super(quill, options);
		console.log('Setting toolbar container', this.quill.container);
		this.quill.container.classList.add('ql-snow');
	}

	extendToolbar(toolbar: Toolbar) {
		console.log('Extending toolbar', toolbar);

		if (toolbar.container != null) {
			toolbar.container.classList.add('ql-snow');
			this.buildButtons(toolbar.container.querySelectorAll('button'), icons);
			this.buildPickers(toolbar.container.querySelectorAll('select'), icons);
			// @ts-expect-error bounds does not exist on options but it does on quill
			this.tooltip = new SpokenTooltip(this.quill, this.options.bounds);
			if (toolbar.container.querySelector('.ql-link')) {
				console.log('Adding link handler');

				this.quill.keyboard.addBinding({ key: 'k', shortKey: true }, (_range: Range, context: Context) => {
					toolbar.handlers['link'].call(toolbar, !context.format['link']);
				});
			}
		} else {
			console.warn('Toolbar container not found');
		}
	}

	override buildPickers(selects: NodeListOf<HTMLSelectElement>, icons: Record<string, string | Record<string, string>>) {
		this.pickers = Array.from(selects).map((select) => {
			if (select.classList.contains('ql-align')) {
				if (select.querySelector('option') == null) {
					fillSelect(select, ALIGNS);
				}
				if (typeof icons['align'] === 'object') {
					return new IconPicker(select, icons['align']);
				}
			}
			if (select.classList.contains('ql-background') || select.classList.contains('ql-color')) {
				const format = select.classList.contains('ql-background') ? 'background' : 'color';
				if (select.querySelector('option') == null) {
					fillSelect(select, COLORS, format === 'background' ? '#ffffff' : '#000000');
				}
				return new ColorPicker(select, icons[format] as string, this.quill);
			}
			if (select.querySelector('option') == null) {
				if (select.classList.contains('ql-font')) {
					fillSelect(select, FONTS);
				} else if (select.classList.contains('ql-header')) {
					fillSelect(select, HEADERS);
				} else if (select.classList.contains('ql-size')) {
					fillSelect(select, SIZES);
				}
			}
			return new Picker(select);
		});
		const update = () => {
			this.pickers.forEach((picker) => {
				picker.update();
			});
		};
		this.quill.on(Emitter.events.EDITOR_CHANGE, update);
	}
}
SpokenTheme.DEFAULTS = merge({}, BaseTheme.DEFAULTS, {
	modules: {
		toolbar: {
			handlers: {
				link(value: string) {
					if (value) {
						const range = this.quill.getSelection();
						if (range == null || range.length === 0) return;
						let preview = this.quill.getText(range);
						if (/^\S+@\S+\.\S+$/.test(preview) && preview.indexOf('mailto:') !== 0) {
							preview = `mailto:${preview}`;
						}
						// @ts-expect-error tooltip does exist on this theme
						const { tooltip } = this.quill.theme;
						tooltip.edit('link', preview);
					} else {
						this.quill.format('link', false, Quill.sources.USER);
					}
				},
			},
		},
	},
} satisfies ThemeOptions);
