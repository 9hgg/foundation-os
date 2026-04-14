import { describe, it, expect, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Stub heavy deps before importing the blot
// ---------------------------------------------------------------------------
vi.mock('@foundation/quill/blots', () => ({
	VIDEO_BLOT_CONTEXT_MENU_WINDOW_KEY: 'openVideoBlotContextMenu',
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

import { VideoBlot } from './video.blot';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeVideoContainer(alt: string, src: string, width = '400px', height = '225px'): HTMLElement {
	const container = document.createElement('span');
	const video = document.createElement('video');
	video.setAttribute('src', src);
	video.setAttribute('title', alt);
	video.style.width = width;
	video.style.height = height;
	container.appendChild(video);
	return container;
}

function makeIframeContainer(title: string, src: string, width = '400px', height = '225px'): HTMLElement {
	const container = document.createElement('span');
	const iframe = document.createElement('iframe');
	iframe.setAttribute('src', src);
	iframe.setAttribute('title', title);
	iframe.style.width = width;
	iframe.style.height = height;
	container.appendChild(iframe);
	return container;
}

// ---------------------------------------------------------------------------
describe('VideoBlot.sanitize', () => {
	it('allows http URLs', () => {
		expect(VideoBlot.sanitize('http://example.com/video.mp4')).toBe('http://example.com/video.mp4');
	});

	it('allows https URLs', () => {
		expect(VideoBlot.sanitize('https://example.com/video.mp4')).toBe('https://example.com/video.mp4');
	});

	it('rejects data: URLs (not in the allow-list)', () => {
		expect(VideoBlot.sanitize('data:video/mp4;base64,abc')).toBe('//:0');
	});

	it('rejects javascript: URLs', () => {
		expect(VideoBlot.sanitize('javascript:alert(1)')).toBe('//:0');
	});

	it('returns //:0 for non-parsable input', () => {
		expect(VideoBlot.sanitize('not-a-url')).toBe('//:0');
	});
});

describe('VideoBlot.formats', () => {
	it('returns empty object when no <iframe> child exists', () => {
		// formats() looks for <iframe>, not <video>
		const container = makeVideoContainer('', 'https://example.com/v.mp4');
		expect(VideoBlot.formats(container)).toEqual({});
	});

	it('reads title and src from an <iframe> child', () => {
		const container = makeIframeContainer('My video', 'https://example.com/v.mp4');
		const formats = VideoBlot.formats(container) as any;
		expect(formats.alt).toBe('My video');
		expect(formats.url).toBe('https://example.com/v.mp4');
	});

	it('reads inline-style width and height from the <iframe>', () => {
		const container = makeIframeContainer('', 'https://example.com/v.mp4', '640px', '360px');
		const formats = VideoBlot.formats(container) as any;
		expect(formats.width).toBe('640px');
		expect(formats.height).toBe('360px');
	});
});

describe('VideoBlot.value', () => {
	it('returns empty object when there is no <iframe> child', () => {
		// value() also looks for <iframe>
		const container = makeVideoContainer('', 'https://example.com/v.mp4');
		expect(VideoBlot.value(container)).toEqual({});
	});

	it('reads title and src from an <iframe> child', () => {
		const container = makeIframeContainer('clip', 'https://example.com/v.mp4');
		const result = VideoBlot.value(container) as any;
		expect(result.alt).toBe('clip');
		expect(result.url).toBe('https://example.com/v.mp4');
	});

	it('returns undefined customData when data-custom-data attribute is absent', () => {
		const container = makeIframeContainer('', 'https://example.com/v.mp4');
		const result = VideoBlot.value(container) as any;
		expect(result.customData).toBeUndefined();
	});
});

describe('VideoBlot instance format()', () => {
	it('sets title attribute on <iframe> for "alt" format', () => {
		const blot = new VideoBlot() as any;
		const container = makeIframeContainer('old', 'https://example.com/v.mp4');
		blot.domNode = container;
		blot.format('alt', 'new title');
		expect(container.querySelector('iframe')!.getAttribute('title')).toBe('new title');
	});

	it('sets src attribute on <iframe> for "url" format', () => {
		const blot = new VideoBlot() as any;
		const container = makeIframeContainer('', 'https://example.com/v.mp4');
		blot.domNode = container;
		blot.format('url', 'https://example.com/new.mp4');
		expect(container.querySelector('iframe')!.getAttribute('src')).toBe('https://example.com/new.mp4');
	});

	it('removes attribute when value is falsy', () => {
		const blot = new VideoBlot() as any;
		const container = makeIframeContainer('old', 'https://example.com/v.mp4');
		blot.domNode = container;
		blot.format('alt', '');
		expect(container.querySelector('iframe')!.hasAttribute('title')).toBe(false);
	});
});
