import { VIDEO_BLOT_CONTEXT_MENU_WINDOW_KEY } from './video-menu/video-menu.service';
import { VideoBlot } from './video.blot';

type ContextMenuOpener = (event: MouseEvent, data: unknown, callback: (value: unknown) => void) => void;

describe('VideoBlot', () => {
	const nodeOf = (value: unknown) => VideoBlot.create(value as never) as HTMLElement;
	const videoIn = (node: HTMLElement) => node.querySelector('video')!;

	afterEach(() => {
		delete (window as unknown as Record<string, unknown>)[VIDEO_BLOT_CONTEXT_MENU_WINDOW_KEY];
		vi.restoreAllMocks();
	});

	describe('creating one', () => {
		it('wraps the player in a non-editable inline container the handle can sit in', () => {
			const node = nodeOf({ alt: 'a clip', url: 'https://example.test/clip.mp4' });

			expect(node.style.display).toBe('inline-block');
			expect(node.style.position).toBe('relative');
			expect(node.getAttribute('contentEditable')).toBe('false');
		});

		it('renders a player with controls, paused, titled by the alt text', () => {
			const node = nodeOf({ alt: 'a clip', url: 'https://example.test/clip.mp4' });

			expect(videoIn(node).getAttribute('src')).toBe('https://example.test/clip.mp4');
			expect(videoIn(node).controls).toBe(true);
			expect(videoIn(node).autoplay).toBe(false);
			expect(videoIn(node).getAttribute('title')).toBe('a clip');
		});

		it('titles an untitled clip rather than leaving the player unnamed', () => {
			expect(videoIn(nodeOf({ alt: '', url: 'https://example.test/clip.mp4' })).getAttribute('title')).toBe('Embedded video');
		});

		it('sizes it as asked, and 400 by 225 when not', () => {
			expect(videoIn(nodeOf({ alt: '', url: 'https://example.test/clip.mp4', width: '80px', height: '40px' })).style.width).toBe('80px');
			expect(videoIn(nodeOf({ alt: '', url: 'https://example.test/clip.mp4' })).style.width).toBe('400px');
			expect(videoIn(nodeOf({ alt: '', url: 'https://example.test/clip.mp4' })).style.height).toBe('225px');
		});

		it('rounds the corners, and takes a radius of its own', () => {
			expect(videoIn(nodeOf({ alt: '', url: 'https://example.test/clip.mp4' })).style.borderRadius).toBe('8px');
			expect(videoIn(nodeOf({ alt: '', url: 'https://example.test/clip.mp4', radius: '0px' })).style.borderRadius).toBe('0px');
		});

		it('takes a bare url as the whole value', () => {
			const node = nodeOf('https://example.test/clip.mp4');

			expect(videoIn(node).getAttribute('src')).toBe('https://example.test/clip.mp4');
			expect(videoIn(node).style.width).toBe('400px');
		});

		it('renders a sourceless player for a value it cannot read, rather than throwing', () => {
			vi.spyOn(console, 'error').mockImplementation(() => undefined);

			expect(videoIn(nodeOf(null)).getAttribute('src')).toBe('');
			expect(videoIn(nodeOf(42)).getAttribute('src')).toBe('');
		});

		// Videos are streamed, never inlined, so data: is not among the schemes allowed here.
		it('allows only http and https', () => {
			expect(VideoBlot.sanitize('https://example.test/clip.mp4')).toBe('https://example.test/clip.mp4');
			expect(VideoBlot.sanitize('http://example.test/clip.mp4')).toBe('http://example.test/clip.mp4');
			expect(VideoBlot.sanitize('data:video/mp4;base64,AAA')).toBe('//:0');
			expect(VideoBlot.sanitize('javascript:alert(1)')).toBe('//:0');
		});

		it('gives it a resize handle in the corner', () => {
			const handle = nodeOf({ alt: '', url: 'https://example.test/clip.mp4' }).querySelector<HTMLElement>('.resize-handle');

			expect(handle).not.toBeNull();
			expect(handle?.style.cursor).toBe('nwse-resize');
		});
	});

	describe('dragging the handle', () => {
		const dragBy = (node: HTMLElement, deltaX: number, deltaY: number) => {
			node.querySelector<HTMLElement>('.resize-handle')!.dispatchEvent(new MouseEvent('mousedown', { clientX: 0, clientY: 0, bubbles: true }));
			document.dispatchEvent(new MouseEvent('mousemove', { clientX: deltaX, clientY: deltaY }));
			document.dispatchEvent(new MouseEvent('mouseup'));
		};

		// offsetWidth is 0 in jsdom, so the sizes below start from zero rather than from 400.
		it('resizes the player as the pointer moves, snapped to ten pixels', () => {
			const node = nodeOf({ alt: '', url: 'https://example.test/clip.mp4' });

			dragBy(node, 137, 96);

			expect(videoIn(node).style.width).toBe('130px');
			expect(videoIn(node).style.height).toBe('90px');
		});

		it('never shrinks below fifty pixels', () => {
			const node = nodeOf({ alt: '', url: 'https://example.test/clip.mp4' });

			dragBy(node, -500, -500);

			expect(videoIn(node).style.width).toBe('50px');
			expect(videoIn(node).style.height).toBe('50px');
		});

		it('stops following the pointer once the button is released', () => {
			const node = nodeOf({ alt: '', url: 'https://example.test/clip.mp4' });
			dragBy(node, 100, 100);

			document.dispatchEvent(new MouseEvent('mousemove', { clientX: 400, clientY: 400 }));

			expect(videoIn(node).style.width).toBe('100px');
		});
	});

	describe('right-clicking one', () => {
		const rightClick = (node: HTMLElement) => node.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true }));

		it('opens the app menu, telling it what the clip is', () => {
			const open = vi.fn();
			(window as unknown as Record<string, ContextMenuOpener>)[VIDEO_BLOT_CONTEXT_MENU_WINDOW_KEY] = open;
			const node = nodeOf({ alt: 'a clip', url: 'https://example.test/clip.mp4', customData: { id: 'file-1' } });

			rightClick(node);

			expect(open).toHaveBeenCalledWith(expect.any(MouseEvent), expect.objectContaining({ alt: 'a clip', url: 'https://example.test/clip.mp4' }), expect.any(Function));
		});

		it('swaps the clip for the one the menu picked', () => {
			let callback: ((value: unknown) => void) | undefined;
			(window as unknown as Record<string, ContextMenuOpener>)[VIDEO_BLOT_CONTEXT_MENU_WINDOW_KEY] = (_event, _data, given) => (callback = given);
			const node = nodeOf({ alt: '', url: 'https://example.test/clip.mp4' });
			rightClick(node);

			callback?.({ action: 'edit', newUrl: 'https://example.test/other.mp4' });

			expect(videoIn(node).getAttribute('src')).toBe('https://example.test/other.mp4');
		});

		it('takes the clip out of the document when the menu says delete', () => {
			let callback: ((value: unknown) => void) | undefined;
			(window as unknown as Record<string, ContextMenuOpener>)[VIDEO_BLOT_CONTEXT_MENU_WINDOW_KEY] = (_event, _data, given) => (callback = given);
			const node = nodeOf({ alt: '', url: 'https://example.test/clip.mp4' });
			document.body.appendChild(node);
			rightClick(node);

			callback?.({ action: 'delete' });

			expect(node.parentNode).toBeNull();
		});

		it('says so rather than throwing when the app menu is not wired up', () => {
			const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

			rightClick(nodeOf({ alt: '', url: 'https://example.test/clip.mp4' }));

			expect(consoleError).toHaveBeenCalled();
		});
	});

	// create() renders a <video>, while formats(), value() and format() all look for an <iframe> --
	// so a blot reads back as having no formats at all. Locked in as it stands; changing which
	// element the blot renders is a behaviour change, not a test one.
	describe('reading one back', () => {
		it('reports no formats and no value for the player it renders', () => {
			const node = nodeOf({ alt: 'a clip', url: 'https://example.test/clip.mp4' });

			expect(VideoBlot.formats(node)).toEqual({});
			expect(VideoBlot.value(node)).toEqual({});
		});

		it('reports the iframe it looks for, when there is one', () => {
			const node = document.createElement('span');
			const iframe = document.createElement('iframe');
			iframe.setAttribute('title', 'a clip');
			iframe.setAttribute('src', 'https://example.test/clip.mp4');
			iframe.style.width = '80px';
			iframe.style.height = '40px';
			node.appendChild(iframe);

			expect(VideoBlot.formats(node)).toEqual({ alt: 'a clip', url: 'https://example.test/clip.mp4', width: '80px', height: '40px' });
			expect(VideoBlot.value(node)).toMatchObject({ alt: 'a clip', url: 'https://example.test/clip.mp4' });
		});

		it('reads back whatever the app stashed on it', () => {
			const node = document.createElement('span');
			node.appendChild(document.createElement('iframe'));
			node.dataset['customData'] = JSON.stringify({ id: 'file-1' });

			expect(VideoBlot.value(node)).toMatchObject({ customData: { id: 'file-1' } });
		});
	});

	describe('formatting one', () => {
		const blotOf = (node: HTMLElement) => {
			const blot = Object.create(VideoBlot.prototype) as VideoBlot & { domNode: HTMLElement };
			blot.domNode = node;
			return blot;
		};
		const nodeWithIframe = () => {
			const node = document.createElement('span');
			node.appendChild(document.createElement('iframe'));
			return node;
		};

		it('writes the alt text as the iframe title and the url as its source', () => {
			const node = nodeWithIframe();

			blotOf(node).format('alt', 'a clip');
			blotOf(node).format('url', 'https://example.test/clip.mp4');

			expect(node.querySelector('iframe')?.getAttribute('title')).toBe('a clip');
			expect(node.querySelector('iframe')?.getAttribute('src')).toBe('https://example.test/clip.mp4');
		});

		it('writes a size straight onto the iframe', () => {
			const node = nodeWithIframe();

			blotOf(node).format('width', '80');

			expect(node.querySelector('iframe')?.getAttribute('width')).toBe('80');
		});

		it('clears each of them when given nothing', () => {
			const node = nodeWithIframe();
			blotOf(node).format('alt', 'a clip');
			blotOf(node).format('url', 'https://example.test/clip.mp4');
			blotOf(node).format('width', '80');

			blotOf(node).format('alt', null);
			blotOf(node).format('url', null);
			blotOf(node).format('width', null);

			const iframe = node.querySelector('iframe')!;
			expect(iframe.hasAttribute('title')).toBe(false);
			expect(iframe.hasAttribute('src')).toBe(false);
			expect(iframe.hasAttribute('width')).toBe(false);
		});

		it('leaves an attribute it does not own to the base blot', () => {
			expect(() => blotOf(nodeWithIframe()).format('bold', true)).toThrow();
		});
	});
});
