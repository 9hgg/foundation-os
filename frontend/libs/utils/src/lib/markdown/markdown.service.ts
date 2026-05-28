import { Injectable } from '@angular/core';
import MarkdownIt from 'markdown-it';
import DOMPurify from 'dompurify';

@Injectable({ providedIn: 'root' })
export class MarkdownService {
	private _md = new MarkdownIt({ html: true, linkify: true, breaks: true });

	render(input: string | null | undefined): string {
		if (!input) return '';
		const raw = this._md.render(input);
		return DOMPurify.sanitize(raw, {
			USE_PROFILES: { html: true },
			FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed'],
			FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover'],
		});
	}
}
