import { TestBed } from '@angular/core/testing';
import { EntityFile } from '@foundation/files/models';
import { RequestService } from '@foundation/network/services';
import { of } from 'rxjs';
import { ExplorerFilePreviewComponent } from './explorer-file-preview.component';

const baseFile: EntityFile = {
	id: '12345678-1234-1234-1234-123456789abc',
	publicFilename: 'Report.pdf',
	inStorage: true,
	extra: {},
	config: {},
};

describe('ExplorerFilePreviewComponent', () => {
	const build = () => {
		TestBed.configureTestingModule({
			imports: [ExplorerFilePreviewComponent],
			providers: [{ provide: RequestService, useValue: { getBasic$: vi.fn().mockReturnValue(of({ result: { file: baseFile } })) } }],
		});
		return TestBed.createComponent(ExplorerFilePreviewComponent);
	};

	it('resolves entityFile from the resource input, and null without one', () => {
		const fixture = build();
		fixture.componentRef.setInput('resource', baseFile);
		fixture.detectChanges();
		expect(fixture.componentInstance.entityFile()).toBe(baseFile);

		TestBed.resetTestingModule();
		const empty = build();
		empty.detectChanges();
		expect(empty.componentInstance.entityFile()).toBeNull();
	});

	it('renders the filename, kind badge, extension, size, and download button', () => {
		const fixture = build();
		fixture.componentRef.setInput('resource', { ...baseFile, kind: 'document', extension: 'pdf', size: 2048, mime: 'application/pdf' });
		fixture.detectChanges();

		const text = fixture.nativeElement.textContent as string;
		expect(text).toContain('Report.pdf');
		expect(text).toContain('document');
		expect(text).toContain('.pdf');
		expect(text).toContain('application/pdf');
		expect(fixture.nativeElement.querySelector('lib-download-button')).toBeTruthy();
	});

	it('falls back to originalFilename, then a placeholder, when unnamed', () => {
		const fixture = build();
		fixture.componentRef.setInput('resource', { ...baseFile, publicFilename: undefined, originalFilename: 'orig.pdf' });
		fixture.detectChanges();
		expect((fixture.nativeElement.textContent as string)).toContain('orig.pdf');

		TestBed.resetTestingModule();
		const unnamed = build();
		unnamed.componentRef.setInput('resource', { ...baseFile, publicFilename: undefined, originalFilename: undefined });
		unnamed.detectChanges();
		expect((unnamed.nativeElement.textContent as string)).toContain('Unnamed file');
	});

	describe('fileDimensions', () => {
		it('joins width and height when both are present', () => {
			const fixture = build();
			fixture.componentRef.setInput('resource', { ...baseFile, extra: { width: 1920, height: 1080 } });
			fixture.detectChanges();
			expect(fixture.componentInstance.fileDimensions()).toBe('1920 × 1080');
		});

		it('is null when only one dimension is present, or neither', () => {
			const fixture = build();
			fixture.componentRef.setInput('resource', { ...baseFile, extra: { width: 1920 } });
			fixture.detectChanges();
			expect(fixture.componentInstance.fileDimensions()).toBeNull();

			fixture.componentRef.setInput('resource', { ...baseFile, extra: {} });
			fixture.detectChanges();
			expect(fixture.componentInstance.fileDimensions()).toBeNull();
		});
	});

	describe('fileDurationFormatted', () => {
		it('formats seconds as minutes:seconds, zero-padded', () => {
			const fixture = build();
			fixture.componentRef.setInput('resource', { ...baseFile, extra: { duration: 65 } });
			fixture.detectChanges();
			expect(fixture.componentInstance.fileDurationFormatted()).toBe('1:05');
		});

		it('is null without a duration', () => {
			const fixture = build();
			fixture.componentRef.setInput('resource', { ...baseFile, extra: {} });
			fixture.detectChanges();
			expect(fixture.componentInstance.fileDurationFormatted()).toBeNull();
		});
	});
});
