import { VIDEO_BLOT_CONTEXT_MENU_WINDOW_KEY } from '@foundation/quill/blots';
import { EmbedBlot } from 'parchment';
import { sanitize } from 'quill/formats/link';
import { CallbackFunction } from '../blots.utils';

const ATTRIBUTES = ['alt', 'width', 'height'];

export class VideoBlot extends EmbedBlot {
	static override blotName = 'video';
	// Use a DIV as the container element. (It must be an HTML element type that can have child elements)
	static override tagName = 'span';
	static override className = 'custom-video-blot';

	static override create(
		value:
			| string
			| {
					alt: string;
					url: string;
					width?: string;
					height?: string;
					radius?: string;
					customData?: any;
			  }
	): HTMLElement {
		// Create the container element via the super create
		const node = super.create(value) as HTMLElement;
		// Set inline-block for inline display and relative positioning for the handle
		node.style.display = 'inline-block';
		node.style.position = 'relative';
		// contentEditable
		node.setAttribute('contentEditable', 'false');
		// Optionally set default border or padding as needed:
		// node.style.border = '1px solid #ccc';

		// Prepare value object if value is given as string
		if (typeof value === 'string') {
			value = { alt: '', url: value, width: '400px', height: '225px' };
		}
		if (!value || typeof value !== 'object') {
			console.error('[CustomVideoBlot](create) Invalid value for CustomVideoBlot', value);
			value = { alt: '', url: '', width: '400px', height: '225px' };
		}

		// Sanitize URL
		value.url = this.sanitize(value.url);

		// Create the HTML element for video embedding
		const video = document.createElement('video');

		video.setAttribute('src', value.url);
		video.autoplay = false;
		video.controls = true;
		video.setAttribute('title', value.alt || 'Embedded video');
		video.setAttribute('frameborder', '0');
		video.setAttribute('allowfullscreen', 'true');
		video.style.width = value.width || '400px';
		video.style.height = value.height || '225px';
		video.style.display = 'block';
		video.style.background = '#000';
		video.style.borderRadius = value.radius || '8px';

		node.appendChild(video);
		console.log('[CustomVideoBlot](create) iframe:', video);

		// Create the resize handle element
		const handle = document.createElement('span');
		handle.className = 'resize-handle';
		// Style the handle (can also be moved to your stylesheet)
		handle.style.position = 'absolute';
		handle.style.width = '10px';
		handle.style.height = '10px';
		handle.style.bottom = '0';
		handle.style.right = '0';
		handle.style.cursor = 'nwse-resize';
		// Optional: style for visibility – adjust colors or shape as needed.
		handle.style.backgroundColor = 'rgba(0,0,0,0.5)';

		// Append handle to container
		node.appendChild(handle);

		// Add resize event listeners to the handle.
		handle.addEventListener('mousedown', (event: MouseEvent) => {
			event.preventDefault();
			event.stopPropagation();
			const startX = event.clientX;
			const startY = event.clientY;
			const startWidth = video.offsetWidth;
			const startHeight = video.offsetHeight;

			const onMouseMove = (moveEvent: MouseEvent) => {
				moveEvent.preventDefault();
				// Calculate new dimensions based on mouse movement
				let newWidth = startWidth + (moveEvent.clientX - startX);
				let newHeight = startHeight + (moveEvent.clientY - startY);
				// Enforce minimum size limits
				newWidth = Math.max(newWidth, 50);
				newHeight = Math.max(newHeight, 50);
				// modulo 10
				newWidth = Math.floor(newWidth / 10) * 10;
				newHeight = Math.floor(newHeight / 10) * 10;
				video.style.width = `${newWidth}px`;
				video.style.height = `${newHeight}px`;
			};

			const onMouseUp = (upEvent: MouseEvent) => {
				document.removeEventListener('mousemove', onMouseMove);
				document.removeEventListener('mouseup', onMouseUp);
				// Optionally update blot formats or trigger a change event here.
			};

			document.addEventListener('mousemove', onMouseMove);
			document.addEventListener('mouseup', onMouseUp);
		});

		// Retain the existing context menu handling on the container
		node.addEventListener(
			'contextmenu',
			(event: MouseEvent) => {
				event.preventDefault();
				event.stopImmediatePropagation();
				console.log('[CustomVideoBlot](contextmenu) event:', event);
				const menuData = {
					alt: value.alt,
					url: value.url,
					customData: value.customData,
				};
				if (typeof (window as any)[VIDEO_BLOT_CONTEXT_MENU_WINDOW_KEY] === 'function') {
					const callback: CallbackFunction = (callbackValue: { action: 'edit'; newUrl: string | undefined } | { action: 'delete' } | any) => {
						if (callbackValue.action === 'edit' && callbackValue.newUrl) {
							console.log('[CustomVideoBlot](contextmenu) edit action with new URL:', callbackValue.newUrl);

							video.setAttribute('src', callbackValue.newUrl);
							value.url = callbackValue.newUrl;
						} else if (callbackValue.action === 'delete') {
							console.log('[CustomVideoBlot](contextmenu) delete action');
							// Handle delete action
							const parent = node.parentNode;
							if (parent) {
								parent.removeChild(node);
							}
						} else {
							console.warn('[CustomVideoBlot](contextmenu) unknown action:', callbackValue);
						}
					};
					(window as any)[VIDEO_BLOT_CONTEXT_MENU_WINDOW_KEY](event, menuData, callback);
				} else {
					console.error('Angular context menu function not available for video blot.');
				}
			},
			true
		);

		// double click to reset video size
		node.addEventListener('dblclick', (event: MouseEvent) => {
			event.preventDefault();
			video.style.width = '400px';
			video.style.height = '225px';
		});

		return node;
	}

	static override formats(domNode: HTMLElement) {
		// Extract formats by looking inside the container for the iframe element.
		const iframe = domNode.querySelector('iframe');
		if (iframe) {
			return {
				alt: iframe.getAttribute('title'),
				url: iframe.getAttribute('src'),
				width: iframe.style.width,
				height: iframe.style.height,
			};
		}
		return {};
	}

	static sanitize(url: string) {
		return sanitize(url, ['http', 'https']) ? url : '//:0';
	}

	static override value(domNode: HTMLElement) {
		const iframe = domNode.querySelector('iframe');
		if (iframe) {
			return {
				alt: iframe.getAttribute('title'),
				url: iframe.getAttribute('src'),
				width: iframe.style.width,
				height: iframe.style.height,
				customData: domNode.dataset['customData'] ? JSON.parse(domNode.dataset['customData']) : undefined,
			};
		}
		return {};
	}

	/**
	 * Format the video blot with the given attribute.
	 * For attributes that belong to the inner iframe, we delegate accordingly.
	 * @param name
	 * @param value
	 */
	override format(name: string, value: any) {
		const iframe = (this.domNode as HTMLElement).querySelector('iframe');
		if (iframe && ATTRIBUTES.indexOf(name) > -1) {
			if (value) {
				if (name === 'alt') {
					iframe.setAttribute('title', value);
				} else if (name === 'url') {
					iframe.setAttribute('src', value);
				} else {
					iframe.setAttribute(name, value);
				}
			} else {
				iframe.removeAttribute(name);
			}
		} else {
			super.format(name, value);
		}
	}
}
