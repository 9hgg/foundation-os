import { TestBed } from '@angular/core/testing';
import { EntityFile } from '@foundation/files/models';
import { FilesRepository } from '@foundation/files/state';
import { of, Subject } from 'rxjs';
import { FilePillComponent } from './file-pill.component';

const file: EntityFile = {
	id: 'file-1',
	publicFilename: 'Report.pdf',
	originalFilename: 'original-report.pdf',
	extension: '.pdf',
	size: 2048,
	inStorage: true,
	extra: {},
	config: {},
};

describe('FilePillComponent', () => {
	let getObjectByIdPullOnce$$$: ReturnType<typeof vi.fn>;

	const build = () => {
		TestBed.configureTestingModule({
			imports: [FilePillComponent],
			providers: [{ provide: FilesRepository, useValue: { store: { getObjectByIdPullOnce$$$ } } }],
		});
		return TestBed.createComponent(FilePillComponent);
	};

	beforeEach(() => {
		getObjectByIdPullOnce$$$ = vi.fn().mockReturnValue({ $: of(null) });
	});

	it('resolves directly from the entityFile input, without fetching', () => {
		const fixture = build();
		fixture.componentRef.setInput('entityFile', file);
		fixture.detectChanges();

		expect(fixture.componentInstance.resolvedFile()).toBe(file);
		expect(getObjectByIdPullOnce$$$).not.toHaveBeenCalled();
	});

	it('fetches by fileId when no entityFile is given, and stops loading once resolved', () => {
		const source = new Subject<EntityFile | null>();
		getObjectByIdPullOnce$$$.mockReturnValue({ $: source.asObservable() });
		const fixture = build();
		fixture.componentRef.setInput('fileId', 'file-1');
		fixture.detectChanges();

		expect(getObjectByIdPullOnce$$$).toHaveBeenCalledWith('file-1');
		expect(fixture.componentInstance.isLoading()).toBe(true);

		source.next(file);
		expect(fixture.componentInstance.resolvedFile()).toBe(file);
		expect(fixture.componentInstance.isLoading()).toBe(false);
	});

	it('ignores a null emission and keeps loading', () => {
		const source = new Subject<EntityFile | null>();
		getObjectByIdPullOnce$$$.mockReturnValue({ $: source.asObservable() });
		const fixture = build();
		fixture.componentRef.setInput('fileId', 'file-1');
		fixture.detectChanges();

		source.next(null);

		expect(fixture.componentInstance.resolvedFile()).toBeNull();
		expect(fixture.componentInstance.isLoading()).toBe(true);
	});

	it('is not loading, and does not fetch, without a fileId', () => {
		const fixture = build();
		fixture.detectChanges();

		expect(getObjectByIdPullOnce$$$).not.toHaveBeenCalled();
		expect(fixture.componentInstance.isLoading()).toBe(false);
	});

	describe('filename', () => {
		it('prefers publicFilename, then originalFilename, then a generic fallback', () => {
			const fixture = build();
			fixture.componentRef.setInput('entityFile', file);
			fixture.detectChanges();
			expect(fixture.componentInstance.filename()).toBe('Report.pdf');

			fixture.componentRef.setInput('entityFile', { ...file, publicFilename: undefined });
			fixture.detectChanges();
			expect(fixture.componentInstance.filename()).toBe('original-report.pdf');

			fixture.componentRef.setInput('entityFile', { ...file, publicFilename: undefined, originalFilename: undefined });
			fixture.detectChanges();
			expect(fixture.componentInstance.filename()).toBe('Fichier');
		});

		it('is null without a resolved file', () => {
			const fixture = build();
			fixture.detectChanges();
			expect(fixture.componentInstance.filename()).toBeNull();
		});
	});

	describe('extension', () => {
		it('strips a leading dot and uppercases', () => {
			const fixture = build();
			fixture.componentRef.setInput('entityFile', { ...file, extension: '.pdf' });
			fixture.detectChanges();
			expect(fixture.componentInstance.extension()).toBe('PDF');
		});

		it('falls back to extensionClient, and null when neither is set', () => {
			const fixture = build();
			fixture.componentRef.setInput('entityFile', { ...file, extension: undefined, extensionClient: 'docx' });
			fixture.detectChanges();
			expect(fixture.componentInstance.extension()).toBe('DOCX');

			fixture.componentRef.setInput('entityFile', { ...file, extension: undefined, extensionClient: undefined });
			fixture.detectChanges();
			expect(fixture.componentInstance.extension()).toBeNull();
		});
	});

	describe('formattedSize', () => {
		it('formats bytes, kilobytes and megabytes', () => {
			const fixture = build();

			fixture.componentRef.setInput('entityFile', { ...file, size: 512 });
			fixture.detectChanges();
			expect(fixture.componentInstance.formattedSize()).toBe('512 B');

			fixture.componentRef.setInput('entityFile', { ...file, size: 2048 });
			fixture.detectChanges();
			expect(fixture.componentInstance.formattedSize()).toBe('2.0 KB');

			fixture.componentRef.setInput('entityFile', { ...file, size: 5 * 1024 * 1024 });
			fixture.detectChanges();
			expect(fixture.componentInstance.formattedSize()).toBe('5.0 MB');
		});

		it('falls back to a parsed sizeClient, and null when nothing parses', () => {
			const fixture = build();

			fixture.componentRef.setInput('entityFile', { ...file, size: undefined, sizeClient: '1024' });
			fixture.detectChanges();
			expect(fixture.componentInstance.formattedSize()).toBe('1.0 KB');

			fixture.componentRef.setInput('entityFile', { ...file, size: undefined, sizeClient: undefined });
			fixture.detectChanges();
			expect(fixture.componentInstance.formattedSize()).toBeNull();

			fixture.componentRef.setInput('entityFile', { ...file, size: 0, sizeClient: undefined });
			fixture.detectChanges();
			expect(fixture.componentInstance.formattedSize()).toBeNull();
		});
	});
});
