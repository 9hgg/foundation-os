import { TestBed } from '@angular/core/testing';
import { EntityFile } from '@foundation/files/models';
import { FileThumbnailComponent } from './file-thumbnail.component';

const imageFile: EntityFile = { id: '12345678-1234-1234-1234-123456789abc', kind: 'image', inStorage: true, extra: {}, config: {} };
const documentFile: EntityFile = {
	id: 'document-1',
	kind: 'document',
	inStorage: true,
	extra: { alternativeFormats: [{ storageSuffix: 'thumbnail', kind: 'image', extension: '.jpg', mime: 'image/jpeg', description: 'thumbnail', alternativeFilename: 'thumb.jpg' }] },
	config: {},
};

describe('FileThumbnailComponent', () => {
	it('computes thumbnail and default URLs for a file', () => {
		const fixture = TestBed.createComponent(FileThumbnailComponent);
		fixture.componentRef.setInput('entityFile', imageFile);
		fixture.detectChanges();

		expect(fixture.componentInstance.thumbnailUrl()).toContain('/api/files/storage/read/12345678-1234-1234-1234-123456789abc/thumbnail');
		expect(fixture.componentInstance.defaultUrl()).toContain('/api/files/storage/read/12345678-1234-1234-1234-123456789abc/default');
	});

	it('returns null URLs without a file', () => {
		const component = TestBed.createComponent(FileThumbnailComponent).componentInstance;

		expect(component.thumbnailUrl()).toBeNull();
		expect(component.defaultUrl()).toBeNull();
		expect(component.canShowDocumentThumbnail()).toBe(false);
	});

	it('tracks failed document thumbnails', () => {
		const fixture = TestBed.createComponent(FileThumbnailComponent);
		fixture.componentRef.setInput('entityFile', documentFile);
		fixture.detectChanges();

		expect(fixture.componentInstance.canShowDocumentThumbnail()).toBe(true);
		fixture.componentInstance.onDocumentThumbnailError('document-1');
		expect(fixture.componentInstance.canShowDocumentThumbnail()).toBe(false);
	});

	it('falls back once when an image fails', () => {
		const component = TestBed.createComponent(FileThumbnailComponent).componentInstance;
		const target = { src: 'broken' } as HTMLImageElement;

		component.onImageError({ target } as unknown as Event, '/fallback.png');
		component.onImageError({ target } as unknown as Event, '/fallback.png');

		expect(target.src).toContain('/fallback.png');
	});
});
