import { DOCUMENT } from '@angular/common';
import { Injectable, inject } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';

export interface OpenGraphParameters {
	locale?: string;
	url?: string;
	type?: string;
	title?: string;
	description?: string;
	image?: string;
	siteName?: string;
}

export interface TwitterCardParameters {
	card?: string;
	title?: string;
	description?: string;
	image?: string;
}

@Injectable({
	providedIn: 'root',
})
export class MetaDataService {
	private readonly _title = inject(Title);
	private readonly _meta = inject(Meta);
	private readonly _document = inject(DOCUMENT);

	private readonly _defaultTitle = this._title.getTitle();
	private readonly _defaultDescription = this.getMetaNameContent('description');
	private readonly _defaultCanonicalUrl = this.getCanonicalUrl();
	private readonly _defaultFaviconUrl = this.getFaviconUrl();

	getTitle(): string {
		return this._title.getTitle();
	}

	setTitle(title: string): void {
		this._title.setTitle(title);
	}

	resetTitle(): void {
		this._title.setTitle(this._defaultTitle);
	}

	setDescription(description: string): void {
		this.setMetaName('description', description);
	}

	resetDescription(): void {
		if (this._defaultDescription) {
			this.setDescription(this._defaultDescription);
			return;
		}

		this.removeMetaName('description');
	}

	setMetaName(name: string, content: string): void {
		this._meta.updateTag({ name, content }, `name="${name}"`);
	}

	removeMetaName(name: string): void {
		this._meta.removeTag(`name="${name}"`);
	}

	setMetaProperty(property: string, content: string): void {
		this._meta.updateTag({ property, content }, `property="${property}"`);
	}

	removeMetaProperty(property: string): void {
		this._meta.removeTag(`property="${property}"`);
	}

	getMetaNameContent(name: string): string | null {
		return this._meta.getTag(`name="${name}"`)?.content ?? null;
	}

	getMetaPropertyContent(property: string): string | null {
		return this._meta.getTag(`property="${property}"`)?.content ?? null;
	}

	setCanonicalUrl(url: string): void {
		let link = this._document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
		if (!link) {
			link = this._document.createElement('link');
			link.setAttribute('rel', 'canonical');
			this._document.head.appendChild(link);
		}

		link.setAttribute('href', url);
	}

	getCanonicalUrl(): string | null {
		return this._document.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.getAttribute('href') ?? null;
	}

	resetCanonicalUrl(): void {
		if (this._defaultCanonicalUrl) {
			this.setCanonicalUrl(this._defaultCanonicalUrl);
			return;
		}

		this._document.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.remove();
	}

	setFavicon(url: string): void {
		let link = this._document.querySelector<HTMLLinkElement>("link[rel~='icon']");
		if (!link) {
			link = this._document.createElement('link');
			link.setAttribute('rel', 'icon');
			this._document.head.appendChild(link);
		}

		link.setAttribute('href', url);
	}

	getFaviconUrl(): string | null {
		return this._document.querySelector<HTMLLinkElement>("link[rel~='icon']")?.getAttribute('href') ?? null;
	}

	resetFavicon(): void {
		if (this._defaultFaviconUrl) {
			this.setFavicon(this._defaultFaviconUrl);
			return;
		}

		this._document.querySelector<HTMLLinkElement>("link[rel~='icon']")?.remove();
	}

	updateOpenGraph(parameters: OpenGraphParameters, allowEmptyValue = false): void {
		const propertyByField: Record<keyof OpenGraphParameters, string> = {
			locale: 'og:locale',
			url: 'og:url',
			type: 'og:type',
			title: 'og:title',
			description: 'og:description',
			image: 'og:image',
			siteName: 'og:site_name',
		};

		Object.entries(parameters).forEach(([field, value]) => {
			if (!allowEmptyValue && !value) return;
			this.setMetaProperty(propertyByField[field as keyof OpenGraphParameters], value ?? '');
		});
	}

	updateTwitterCard(parameters: TwitterCardParameters, allowEmptyValue = false): void {
		const nameByField: Record<keyof TwitterCardParameters, string> = {
			card: 'twitter:card',
			title: 'twitter:title',
			description: 'twitter:description',
			image: 'twitter:image',
		};

		Object.entries(parameters).forEach(([field, value]) => {
			if (!allowEmptyValue && !value) return;
			this.setMetaName(nameByField[field as keyof TwitterCardParameters], value ?? '');
		});
	}
}
