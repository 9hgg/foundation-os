import { TestBed } from '@angular/core/testing';
import { MetaDataService } from './meta-data.service';

describe('MetaDataService', () => {
	let service: MetaDataService;
	let initialTitle: string;
	let initialDescription: string | null;
	let initialCanonicalUrl: string | null;
	let initialFaviconUrl: string | null;

	beforeEach(() => {
		TestBed.configureTestingModule({});
		service = TestBed.inject(MetaDataService);
		initialTitle = service.getTitle();
		initialDescription = service.getMetaNameContent('description');
		initialCanonicalUrl = service.getCanonicalUrl();
		initialFaviconUrl = service.getFaviconUrl();
	});

	afterEach(() => {
		service.resetTitle();
		service.resetDescription();
		service.resetCanonicalUrl();
		service.resetFavicon();
	});

	it('sets and resets the document title', () => {
		service.setTitle('Custom title');
		expect(service.getTitle()).toBe('Custom title');

		service.resetTitle();
		expect(service.getTitle()).toBe(initialTitle);
	});

	it('sets and resets the description meta tag', () => {
		service.setDescription('Helpful description');
		expect(service.getMetaNameContent('description')).toBe('Helpful description');

		service.resetDescription();
		expect(service.getMetaNameContent('description')).toBe(initialDescription);
	});

	it('sets and resets the canonical url', () => {
		service.setCanonicalUrl('https://example.com/page');
		expect(service.getCanonicalUrl()).toBe('https://example.com/page');

		service.resetCanonicalUrl();
		expect(service.getCanonicalUrl()).toBe(initialCanonicalUrl);
	});

	it('sets and resets the favicon', () => {
		service.setFavicon('/custom-favicon.ico');
		expect(service.getFaviconUrl()).toBe('/custom-favicon.ico');

		service.resetFavicon();
		expect(service.getFaviconUrl()).toBe(initialFaviconUrl);
	});

	it('updates open graph and twitter metadata', () => {
		service.updateOpenGraph({
			title: 'OG Title',
			description: 'OG Description',
			image: '/og.png',
		});
		service.updateTwitterCard({
			card: 'summary_large_image',
			title: 'Twitter Title',
		});

		expect(service.getMetaPropertyContent('og:title')).toBe('OG Title');
		expect(service.getMetaPropertyContent('og:description')).toBe('OG Description');
		expect(service.getMetaPropertyContent('og:image')).toBe('/og.png');
		expect(service.getMetaNameContent('twitter:card')).toBe('summary_large_image');
		expect(service.getMetaNameContent('twitter:title')).toBe('Twitter Title');
	});
});
