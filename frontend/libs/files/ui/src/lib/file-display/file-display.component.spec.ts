import { TestBed } from '@angular/core/testing';
import { EntityFile } from '@foundation/files/models';
import { FileDisplayComponent } from './file-display.component';

const file: EntityFile = {
	id: '12345678-1234-1234-1234-123456789abc',
	kind: 'document',
	extension: 'docx',
	inStorage: true,
	extra: {
		alternativeFormats: [{ storageSuffix: 'pdf', extension: '.pdf', mime: 'application/pdf', kind: 'document', description: 'PDF', alternativeFilename: 'file.pdf' }],
	},
	config: {},
};

describe('FileDisplayComponent', () => {
	it('builds file and safe viewer URLs', () => {
		const component = TestBed.createComponent(FileDisplayComponent).componentInstance;

		expect(component.getFileUrl(file)).toContain('/api/files/storage/read/12345678-1234-1234-1234-123456789abc/default');
		expect(String(component.getSafeFileResourceUrl(file, 'pdf'))).toContain('SafeValue');
		expect(String(component.getSafeOfficeViewerUrl(file))).toContain('SafeValue');
	});

	it('detects pdf alternatives', () => {
		const component = TestBed.createComponent(FileDisplayComponent).componentInstance;

		expect(component.hasPdfAlternative(file)).toBe(true);
		expect(component.hasPdfAlternative({ ...file, extra: { alternativeFormats: [] } })).toBe(false);
		expect(component.hasPdfAlternative({ ...file, extra: { alternativeFormats: [{ storageSuffix: 'pdf', extension: '.txt', mime: 'text/plain', kind: 'text', description: 'Text', alternativeFilename: 'file.txt' }] } })).toBe(true);
	});
});
