import { TestBed } from '@angular/core/testing';
import { DomSanitizer } from '@angular/platform-browser';
import { PdfViewerComponent } from './pdf-viewer.component';

describe('PdfViewerComponent', () => {
	function mount() {
		TestBed.configureTestingModule({ imports: [PdfViewerComponent] });
		const fixture = TestBed.createComponent(PdfViewerComponent);
		fixture.detectChanges();
		return { fixture, component: fixture.componentInstance };
	}

	afterEach(() => TestBed.resetTestingModule());

	it('defaults to no url, a generic title and no container class', () => {
		const { component } = mount();
		expect(component.pdfUrl()).toBeNull();
		expect(component.title()).toBe('PDF');
		expect(component.containerClass()).toBeNull();
		expect(component.safeUrl()).toBeNull();
	});

	it('sanitizes and appends an empty view fragment to a url with none', () => {
		const { fixture, component } = mount();
		fixture.componentRef.setInput('pdfUrl', 'https://example.test/report.pdf');
		fixture.detectChanges();

		const sanitizer = TestBed.inject(DomSanitizer);
		const safeUrl = component.safeUrl();
		expect(safeUrl).not.toBeNull();
		expect(sanitizer.sanitize(4 /* SecurityContext.RESOURCE_URL */, safeUrl)).toBe('https://example.test/report.pdf#');
	});

	it('leaves an existing fragment alone rather than appending another', () => {
		const { fixture, component } = mount();
		fixture.componentRef.setInput('pdfUrl', 'https://example.test/report.pdf#page=3');
		fixture.detectChanges();

		const sanitizer = TestBed.inject(DomSanitizer);
		const safeUrl = component.safeUrl();
		expect(sanitizer.sanitize(4, safeUrl)).toBe('https://example.test/report.pdf#page=3');
	});

	it('goes back to null once the url is cleared', () => {
		const { fixture, component } = mount();
		fixture.componentRef.setInput('pdfUrl', 'https://example.test/report.pdf');
		fixture.detectChanges();
		expect(component.safeUrl()).not.toBeNull();

		fixture.componentRef.setInput('pdfUrl', null);
		fixture.detectChanges();
		expect(component.safeUrl()).toBeNull();
	});

	it('accepts a custom title and container class', () => {
		const { fixture, component } = mount();
		fixture.componentRef.setInput('title', 'Invoice');
		fixture.componentRef.setInput('containerClass', 'h-full');
		fixture.detectChanges();

		expect(component.title()).toBe('Invoice');
		expect(component.containerClass()).toBe('h-full');
	});
});
