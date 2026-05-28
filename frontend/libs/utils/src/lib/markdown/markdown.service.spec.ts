import { TestBed } from '@angular/core/testing';
import { MarkdownService } from './markdown.service';

describe('MarkdownService', () => {
	let service: MarkdownService;

	beforeEach(() => {
		TestBed.configureTestingModule({
			providers: [MarkdownService],
		});
		service = TestBed.inject(MarkdownService);
	});

	it('should be created', () => {
		expect(service).toBeTruthy();
	});

	it('renders headings: # Hello → contains <h1> and Hello', () => {
		const result = service.render('# Hello');
		expect(result).toContain('<h1>');
		expect(result).toContain('Hello');
	});

	it('renders bold: **bold** → contains <strong>bold</strong>', () => {
		const result = service.render('**bold**');
		expect(result).toContain('<strong>bold</strong>');
	});

	it('renders links: [link](https://example.com) → contains <a href="https://example.com">', () => {
		const result = service.render('[link](https://example.com)');
		expect(result).toContain('<a href="https://example.com"');
	});

	it('renders lists: - item → contains <li>', () => {
		const result = service.render('- item');
		expect(result).toContain('<li>');
	});

	it('renders line breaks with breaks:true: line1\\nline2 → contains <br>', () => {
		const result = service.render('line1\nline2');
		expect(result).toContain('<br');
	});

	it('passes through safe embedded HTML: <b>bold</b> → contains <b>bold</b>', () => {
		const result = service.render('<b>bold</b>');
		expect(result).toContain('<b>bold</b>');
	});

	it('strips script tags: <script>alert(1)</script> → does NOT contain <script>', () => {
		const result = service.render('<script>alert(1)</script>');
		expect(result).not.toContain('<script>');
	});

	it('strips event handlers: <img onerror="alert(1)" src="x"> → does NOT contain onerror', () => {
		const result = service.render('<img onerror="alert(1)" src="x">');
		expect(result).not.toContain('onerror');
	});

	it('returns empty string for null', () => {
		expect(service.render(null)).toBe('');
	});

	it('returns empty string for undefined', () => {
		expect(service.render(undefined)).toBe('');
	});

	it('returns empty string for empty string', () => {
		expect(service.render('')).toBe('');
	});
});
