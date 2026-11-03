import { IMAGE_BLOT_CONTEXT_MENU_WINDOW_KEY } from './image-menu/image-menu.service';
import { ImageBlot } from './image.blot';

type ContextMenuOpener = (event: MouseEvent, data: unknown, callback: (value: unknown) => void) => void;

describe('ImageBlot', () => {
	const nodeOf = (value: unknown) => ImageBlot.create(value as never) as HTMLElement;
	const imageIn = (node: HTMLElement) => node.querySelector('img')!;

	afterEach(() => {
		delete (window as unknown as Record<string, unknown>)[IMAGE_BLOT_CONTEXT_MENU_WINDOW_KEY];
		vi.restoreAllMocks();
	});

	describe('creating one', () => {
		it('wraps the image in a non-editable inline container the handle can sit in', () => {
			const node = nodeOf({ alt: 'a picture', url: 'https://example.test/pic.png' });

			expect(node.style.display).toBe('inline-block');
			expect(node.style.position).toBe('relative');
			expect(node.getAttribute('contentEditable')).toBe('false');
		});

		it('renders the image with its address and its alt text', () => {
			const node = nodeOf({ alt: 'a picture', url: 'https://example.test/pic.png' });

			expect(imageIn(node).getAttribute('src')).toBe('https://example.test/pic.png');
			expect(imageIn(node).getAttribute('alt')).toBe('a picture');
			expect(imageIn(node).style.objectFit).toBe('cover');
		});

		it('sizes it as asked, and 200 square when not', () => {
			expect(imageIn(nodeOf({ alt: '', url: 'https://example.test/pic.png', width: '80px', height: '40px' })).style.width).toBe('80px');
			expect(imageIn(nodeOf({ alt: '', url: 'https://example.test/pic.png' })).style.width).toBe('200px');
			expect(imageIn(nodeOf({ alt: '', url: 'https://example.test/pic.png' })).style.height).toBe('200px');
		});

		it('takes a bare url as the whole value', () => {
			const node = nodeOf('https://example.test/pic.png');

			expect(imageIn(node).getAttribute('src')).toBe('https://example.test/pic.png');
			expect(imageIn(node).getAttribute('alt')).toBe('');
		});

		it('falls back to a placeholder for a value it cannot read', () => {
			vi.spyOn(console, 'error').mockImplementation(() => undefined);

			expect(imageIn(nodeOf(null)).getAttribute('src')).toContain('image-placeholder');
			expect(imageIn(nodeOf(42)).getAttribute('src')).toContain('image-placeholder');
		});

		it('refuses a url whose scheme is not one images come over', () => {
			expect(imageIn(nodeOf({ alt: '', url: 'javascript:alert(1)' })).getAttribute('src')).toBe('//:0');
		});

		it('allows http, https and inline data images', () => {
			expect(ImageBlot.sanitize('http://example.test/pic.png')).toBe('http://example.test/pic.png');
			expect(ImageBlot.sanitize('https://example.test/pic.png')).toBe('https://example.test/pic.png');
			expect(ImageBlot.sanitize('data:image/png;base64,AAA')).toBe('data:image/png;base64,AAA');
		});

		it('gives it a resize handle in the corner', () => {
			const node = nodeOf({ alt: '', url: 'https://example.test/pic.png' });
			const handle = node.querySelector<HTMLElement>('.resize-handle');

			expect(handle).not.toBeNull();
			expect(handle?.style.cursor).toBe('nwse-resize');
		});
	});

	describe('dragging the handle', () => {
		const dragBy = (node: HTMLElement, deltaX: number, deltaY: number) => {
			const handle = node.querySelector<HTMLElement>('.resize-handle')!;
			handle.dispatchEvent(new MouseEvent('mousedown', { clientX: 0, clientY: 0, bubbles: true }));
			document.dispatchEvent(new MouseEvent('mousemove', { clientX: deltaX, clientY: deltaY }));
			document.dispatchEvent(new MouseEvent('mouseup'));
		};

		// offsetWidth is 0 in jsdom, so the sizes below start from zero rather than from 200.
		it('resizes the image as the pointer moves, snapped to ten pixels', () => {
			const node = nodeOf({ alt: '', url: 'https://example.test/pic.png' });

			dragBy(node, 137, 96);

			expect(imageIn(node).style.width).toBe('130px');
			expect(imageIn(node).style.height).toBe('90px');
		});

		it('never shrinks below fifty pixels', () => {
			const node = nodeOf({ alt: '', url: 'https://example.test/pic.png' });

			dragBy(node, -500, -500);

			expect(imageIn(node).style.width).toBe('50px');
			expect(imageIn(node).style.height).toBe('50px');
		});

		it('stops following the pointer once the button is released', () => {
			const node = nodeOf({ alt: '', url: 'https://example.test/pic.png' });
			dragBy(node, 100, 100);

			document.dispatchEvent(new MouseEvent('mousemove', { clientX: 400, clientY: 400 }));

			expect(imageIn(node).style.width).toBe('100px');
		});

		it('double-clicking puts it back to 200 square', () => {
			const node = nodeOf({ alt: '', url: 'https://example.test/pic.png' });
			dragBy(node, 500, 500);

			node.dispatchEvent(new MouseEvent('dblclick'));

			expect(imageIn(node).style.width).toBe('200px');
			expect(imageIn(node).style.height).toBe('200px');
		});
	});

	describe('right-clicking one', () => {
		const rightClick = (node: HTMLElement) => node.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true }));

		it('opens the app menu, telling it what the image is', () => {
			const open = vi.fn();
			(window as unknown as Record<string, ContextMenuOpener>)[IMAGE_BLOT_CONTEXT_MENU_WINDOW_KEY] = open;
			const node = nodeOf({ alt: 'a picture', url: 'https://example.test/pic.png', customData: { id: 'file-1' } });

			rightClick(node);

			expect(open).toHaveBeenCalledWith(expect.any(MouseEvent), { alt: 'a picture', url: 'https://example.test/pic.png', customData: { id: 'file-1' } }, expect.any(Function));
		});

		it('swaps the image for the one the menu picked', () => {
			let callback: ((value: unknown) => void) | undefined;
			(window as unknown as Record<string, ContextMenuOpener>)[IMAGE_BLOT_CONTEXT_MENU_WINDOW_KEY] = (_event, _data, given) => (callback = given);
			const node = nodeOf({ alt: '', url: 'https://example.test/pic.png' });
			rightClick(node);

			callback?.({ action: 'edit', newUrl: 'https://example.test/other.png' });

			expect(imageIn(node).getAttribute('src')).toBe('https://example.test/other.png');
		});

		it('takes the image out of the document when the menu says delete', () => {
			let callback: ((value: unknown) => void) | undefined;
			(window as unknown as Record<string, ContextMenuOpener>)[IMAGE_BLOT_CONTEXT_MENU_WINDOW_KEY] = (_event, _data, given) => (callback = given);
			const node = nodeOf({ alt: '', url: 'https://example.test/pic.png' });
			document.body.appendChild(node);
			rightClick(node);

			callback?.({ action: 'delete' });

			expect(node.parentNode).toBeNull();
		});

		it('leaves the image alone for an edit that names no replacement, or an action it does not know', () => {
			let callback: ((value: unknown) => void) | undefined;
			(window as unknown as Record<string, ContextMenuOpener>)[IMAGE_BLOT_CONTEXT_MENU_WINDOW_KEY] = (_event, _data, given) => (callback = given);
			vi.spyOn(console, 'warn').mockImplementation(() => undefined);
			const node = nodeOf({ alt: '', url: 'https://example.test/pic.png' });
			rightClick(node);

			callback?.({ action: 'edit' });
			callback?.({ action: 'fly-away' });

			expect(imageIn(node).getAttribute('src')).toBe('https://example.test/pic.png');
		});

		it('says so rather than throwing when the app menu is not wired up', () => {
			const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
			const node = nodeOf({ alt: '', url: 'https://example.test/pic.png' });

			rightClick(node);

			expect(consoleError).toHaveBeenCalledWith('Angular context menu function not available for image blot.');
		});
	});

	describe('reading one back', () => {
		it('reports the attributes the image carries, and only those', () => {
			const node = nodeOf({ alt: '', url: 'https://example.test/pic.png' });
			imageIn(node).setAttribute('alt', 'a picture');
			imageIn(node).setAttribute('width', '120');

			expect(ImageBlot.formats(node)).toEqual({ alt: 'a picture', width: '120' });
		});

		it('reports nothing for a container with no image in it', () => {
			expect(ImageBlot.formats(document.createElement('span'))).toEqual({});
			expect(ImageBlot.value(document.createElement('span'))).toEqual({});
		});

		it('reads the value back as the address, alt text and size', () => {
			const node = nodeOf({ alt: 'a picture', url: 'https://example.test/pic.png', width: '80px', height: '40px' });

			expect(ImageBlot.value(node)).toEqual({
				alt: 'a picture',
				url: 'https://example.test/pic.png',
				width: '80px',
				height: '40px',
				customData: undefined,
			});
		});

		it('reads back whatever the app stashed on it', () => {
			const node = nodeOf({ alt: '', url: 'https://example.test/pic.png' });
			node.dataset['customData'] = JSON.stringify({ id: 'file-1' });

			expect(ImageBlot.value(node)).toMatchObject({ customData: { id: 'file-1' } });
		});
	});

	describe('formatting one', () => {
		const blotOf = (node: HTMLElement) => {
			const blot = Object.create(ImageBlot.prototype) as ImageBlot & { domNode: HTMLElement };
			blot.domNode = node;
			return blot;
		};

		it('writes an image attribute onto the image itself', () => {
			const node = nodeOf({ alt: '', url: 'https://example.test/pic.png' });

			blotOf(node).format('width', '120');

			expect(imageIn(node).getAttribute('width')).toBe('120');
		});

		it('clears an image attribute when given nothing', () => {
			const node = nodeOf({ alt: '', url: 'https://example.test/pic.png' });
			imageIn(node).setAttribute('width', '120');

			blotOf(node).format('width', null);

			expect(imageIn(node).hasAttribute('width')).toBe(false);
		});

		it('leaves an attribute it does not own to the base blot', () => {
			const node = nodeOf({ alt: '', url: 'https://example.test/pic.png' });

			expect(() => blotOf(node).format('bold', true)).toThrow();
		});
	});
});
