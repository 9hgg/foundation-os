import { TestBed } from '@angular/core/testing';
import { EntityFile } from '@foundation/files/models';
import { RequestService } from '@foundation/network/services';
import { of } from 'rxjs';
import { DownloadButtonComponent } from './download-button.component';

const file: EntityFile = {
	id: '12345678-1234-1234-1234-123456789abc',
	extension: 'mp4',
	size: 123,
	inStorage: true,
	extra: {
		alternativeFormats: [{ storageSuffix: 'thumbnail', extension: 'jpg', mime: 'image/jpeg', kind: 'image', size: 12, description: 'Thumbnail', alternativeFilename: 'thumb.jpg' }],
	},
	config: {},
};

describe('DownloadButtonComponent', () => {
	let requestService: { getBasic$: ReturnType<typeof vi.fn> };

	beforeEach(async () => {
		requestService = { getBasic$: vi.fn().mockReturnValue(of({ result: { file } })) };
		await TestBed.configureTestingModule({
			imports: [DownloadButtonComponent],
			providers: [{ provide: RequestService, useValue: requestService }],
		})
			.overrideComponent(DownloadButtonComponent, { set: { imports: [], template: '' } })
			.compileComponents();
	});

	it('loads file details and builds download alternatives', () => {
		const fixture = TestBed.createComponent(DownloadButtonComponent);
		fixture.componentRef.setInput('entityFileId', '12345678-1234-1234-1234-123456789abc');
		fixture.detectChanges();

		expect(requestService.getBasic$).toHaveBeenCalledWith('/api/files/storage/read/12345678-1234-1234-1234-123456789abc/details');
		expect(fixture.componentInstance.entityFile()).toBe(file);
		expect(fixture.componentInstance.alternatives()).toEqual([
			expect.objectContaining({ label: 'Original', extension: 'mp4', size: 123 }),
			expect.objectContaining({ label: 'Thumbnail', extension: 'jpg', size: 12 }),
		]);
	});

	it('does not request details for an invalid id', () => {
		const fixture = TestBed.createComponent(DownloadButtonComponent);
		fixture.componentRef.setInput('entityFileId', 'bad-id');
		fixture.detectChanges();

		expect(requestService.getBasic$).not.toHaveBeenCalled();
		expect(fixture.componentInstance.alternatives()).toEqual([]);
	});

	it('creates a temporary link when downloading an alternative', () => {
		const component = TestBed.createComponent(DownloadButtonComponent).componentInstance;
		const event = { stopPropagation: vi.fn() } as unknown as Event;
		const click = vi.fn();
		const anchor = document.createElement('a');
		anchor.click = click;
		const createElementSpy = vi.spyOn(document, 'createElement').mockReturnValue(anchor);

		component.downloadAlternative('/download', event);

		expect(event.stopPropagation).toHaveBeenCalled();
		expect(anchor.href).toContain('/download');
		expect(anchor.target).toBe('_blank');
		expect(click).toHaveBeenCalled();
		createElementSpy.mockRestore();
	});
});
