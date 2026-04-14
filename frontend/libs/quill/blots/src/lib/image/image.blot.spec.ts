import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Stub heavy deps before importing the blot
// ---------------------------------------------------------------------------
vi.mock('@foundation/quill/blots', () => ({
	IMAGE_BLOT_CONTEXT_MENU_WINDOW_KEY: 'openImageBlotContextMenu',
}));

vi.mock('quill/formats/link', () => ({
	sanitize: (url: string, protocols: string[]) => {
		try {
			const { protocol } = new URL(url);
			return protocols.some((p) => protocol === p + ':');
		} catch {
			return false;
		}
	},
}));

vi.mock('parchment', () => {
	class EmbedBlotMock {
		domNode: HTMLElement;
		constructor() {
			this.domNode = document.createElement('span');
		}
		static create(_value: any) {
			return document.createElement('span');
		}
		static formats(_node: HTMLElement) {
			return {};
		}
		format(_name: string, _value: any) {}
	}
	return { EmbedBlot: EmbedBlotMock };
});

import { ImageBlot } from './image.blot';

// ---------------------------------------------------------------------------
// Helper: build a container <span> that mimics what ImageBlot.create produces
// ---------------------------------------------------------------------------
function makeImageContainer(alt: string, src: string, width = '300px', height = '200px'): HTMLElement {
	const container = document.createElement('span');
	const img = document.createElement('img');
	img.setAttribute('alt', alt);
	img.setAttribute('src', src);
	img.style.width = width;
	img.style.height = height;
	container.appendChild(img);
	return container;
}

// ---------------------------------------------------------------------------
describe('ImageBlot.sanitize', () => {
	it('allows http URLs', () => {
		expect(ImageBlot.sanitize('http://example.com/img.png')).toBe('http://example.com/img.png');
	});

	it('allows https URLs', () => {
		expect(ImageBlot.sanitize('https://example.com/img.png')).toBe('https://example.com/img.png');
	});

	it('allows data URLs', () => {
		expect(ImageBlot.sanitize('data:image/png;base64,abc')).toBe('data:image/png;base64,abc');
	});

	it('rejects javascript: URLs', () => {
		expect(ImageBlot.sanitize('javascript:alert(1)')).toBe('//:0');
	});

	it('rejects ftp: URLs', () => {
		expect(ImageBlot.sanitize('ftp://example.com/file')).toBe('//:0');
	});
});

describe('ImageBlot.formats', () => {
	it('returns an empty object when there is no <img> child', () => {
		const node = document.createElement('span');
		expect(ImageBlot.formats(node)).toEqual({});
	});

	it('returns alt and src attributes present on the <img>', () => {
		const container = makeImageContainer('My image', 'https://example.com/img.png');
		const formats = ImageBlot.formats(container);
		expect(formats['alt']).toBe('My image');
	});

	it('does not include attributes that are absent from the <img>', () => {
		const container = makeImageContainer('', 'https://example.com/img.png');
		// width/height are set via style, not attribute — should be absent from formats
		const formats = ImageBlot.formats(container);
		expect(Object.keys(formats)).not.toContain('width');
		expect(Object.keys(formats)).not.toContain('height');
	});

	it('includes width attribute when explicitly set as an HTML attribute', () => {
		const container = makeImageContainer('', 'https://example.com/img.png');
		const img = container.querySelector('img')!;
		img.setAttribute('width', '400');
		const formats = ImageBlot.formats(container);
		expect(formats['width']).toBe('400');
	});
});

describe('ImageBlot.value', () => {
	it('returns an empty object when there is no <img> child', () => {
		const node = document.createElement('span');
		expect(ImageBlot.value(node)).toEqual({});
	});

	it('reads alt and src from the <img> element', () => {
		const container = makeImageContainer('Alt text', 'https://example.com/img.png');
		const result = ImageBlot.value(container) as any;
		expect(result.alt).toBe('Alt text');
		expect(result.url).toBe('https://example.com/img.png');
	});

	it('reads width from inline style when no width attribute is set', () => {
		const container = makeImageContainer('', 'https://example.com/img.png', '350px', '250px');
		const result = ImageBlot.value(container) as any;
		expect(result.width).toBe('350px');
		expect(result.height).toBe('250px');
	});

	it('prefers the width attribute over the inline style', () => {
		const container = makeImageContainer('', 'https://example.com/img.png', '350px', '250px');
		const img = container.querySelector('img')!;
		img.setAttribute('width', '500');
		const result = ImageBlot.value(container) as any;
		expect(result.width).toBe('500');
	});

	it('returns undefined customData when data-custom-data is absent', () => {
		const container = makeImageContainer('', 'https://example.com/img.png');
		const result = ImageBlot.value(container) as any;
		expect(result.customData).toBeUndefined();
	});
});

describe('ImageBlot instance format()', () => {
	it('sets an attribute on the inner <img> for known attributes', () => {
		const blot = new ImageBlot() as any;
		const container = makeImageContainer('', 'https://example.com/img.png');
		blot.domNode = container;
		blot.format('alt', 'new alt');
		const img = container.querySelector('img')!;
		expect(img.getAttribute('alt')).toBe('new alt');
	});

	it('removes the attribute when value is falsy', () => {
		const blot = new ImageBlot() as any;
		const container = makeImageContainer('old-alt', 'https://example.com/img.png');
		blot.domNode = container;
		blot.format('alt', '');
		const img = container.querySelector('img')!;
		expect(img.hasAttribute('alt')).toBe(false);
	});
});
