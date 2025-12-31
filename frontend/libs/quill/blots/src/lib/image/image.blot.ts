import { IMAGE_BLOT_CONTEXT_MENU_WINDOW_KEY } from '@foundation/quill/blots';
import { EmbedBlot } from 'parchment';
import { sanitize } from 'quill/formats/link';
import { CallbackFunction } from '../blots.utils';

const ATTRIBUTES = ['alt', 'width', 'height'];

export class ImageBlot extends EmbedBlot {
	static override blotName = 'image';
	// Use a DIV as the container element. (It must be an HTML element type that can have child elements)
	static override tagName = 'span';
	static override className = 'custom-image-blot';

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
			value = { alt: '', url: value, width: '200px', height: '200px' };
		}
		if (!value || typeof value !== 'object') {
			console.error('[CustomImageBlot](create) Invalid value for CustomImageBlot', value);
			value = { alt: '', url: '/assets/articles/image-placeholder.png', width: '200px', height: '200px' };
		}

		// Sanitize URL
		value.url = this.sanitize(value.url);

		// Create the IMG element
		const img = document.createElement('IMG');
		img.setAttribute('src', value.url);
		img.setAttribute('alt', value.alt);
		// Set the size either using attributes or inline style; here we use inline style for resizing
		img.style.width = value.width || '200px';
		img.style.height = value.height || '200px';
		// Make sure image takes full width of container (display block avoids unexpected inline gaps)
		img.style.display = 'block';
		// add cover style to avoid image distortion
		img.style.objectFit = 'cover';

		// Append image to the container
		node.appendChild(img);

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
			const startWidth = img.offsetWidth;
			const startHeight = img.offsetHeight;

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

				// Update image styles with new dimensions
				img.style.width = `${newWidth}px`;
				img.style.height = `${newHeight}px`;
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
		node.addEventListener('contextmenu', (event: MouseEvent) => {
			event.preventDefault();
			console.log('[CustomImageBlot](contextmenu) event:', event);
			const menuData = {
				alt: value.alt,
				url: value.url,
				customData: value.customData,
			};

			if (typeof (window as any)[IMAGE_BLOT_CONTEXT_MENU_WINDOW_KEY] === 'function') {
				const callback: CallbackFunction = (
					callbackValue:
						| { action: 'edit'; newUrl: string | undefined }
						| {
								action: 'delete';
						  }
						| any
				) => {
					if (callbackValue.action === 'edit' && callbackValue.newUrl) {
						console.log('[CustomImageBlot](contextmenu) newUrl:', callbackValue.newUrl);

						img.setAttribute('src', callbackValue.newUrl);
						value.url = callbackValue.newUrl;
					} else if (callbackValue.action === 'delete') {
						console.log('[CustomImageBlot](contextmenu) delete action');
						// Handle delete action
						const parent = node.parentNode;
						if (parent) {
							parent.removeChild(node);
						}
					} else {
						console.warn('[CustomImageBlot](contextmenu) unknown action:', callbackValue);
					}
				};
				(window as any)[IMAGE_BLOT_CONTEXT_MENU_WINDOW_KEY](event, menuData, callback);
			} else {
				console.error('Angular context menu function not available for image blot.');
			}
		});

		// double click to reset image size
		node.addEventListener('dblclick', (event: MouseEvent) => {
			event.preventDefault();
			img.style.width = '200px';
			img.style.height = '200px';
		});

		return node;
	}

	static override formats(domNode: HTMLElement) {
		// Extract formats by looking inside the container for the image element.
		const img = domNode.querySelector('img');
		if (img) {
			return ATTRIBUTES.reduce(
				(formats, attribute) => {
					if (img.hasAttribute(attribute)) {
						formats[attribute] = img.getAttribute(attribute);
					}
					return formats;
				},
				{} as Record<string, string | null>
			);
		}
		return {};
	}

	static sanitize(url: string) {
		return sanitize(url, ['http', 'https', 'data']) ? url : '//:0';
	}

	static override value(domNode: HTMLElement) {
		const img = domNode.querySelector('img');
		if (img) {
			return {
				alt: img.getAttribute('alt'),
				url: img.getAttribute('src'),
				width: img.getAttribute('width') || img.style.width,
				height: img.getAttribute('height') || img.style.height,
				customData: domNode.dataset['customData'] ? JSON.parse(domNode.dataset['customData']) : undefined,
			};
		}
		return {};
	}

	/**
	 * Format the image blot with the given attribute.
	 * For attributes that belong to the inner image, we delegate accordingly.
	 * @param name
	 * @param value
	 */
	override format(name: string, value: any) {
		const img = (this.domNode as HTMLElement).querySelector('img');
		if (img && ATTRIBUTES.indexOf(name) > -1) {
			if (value) {
				img.setAttribute(name, value);
			} else {
				img.removeAttribute(name);
			}
		} else {
			super.format(name, value);
		}
	}
}
