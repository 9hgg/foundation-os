import { ElementRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { EntityFile } from '@foundation/files/models';
import { FilesRepository } from '@foundation/files/state';
import { DragAndDropService } from '@foundation/utils';
import { BehaviorSubject, of } from 'rxjs';
import { UploadButtonComponent } from './upload-button.component';

const file: EntityFile = { id: 'file-1', inStorage: true, extra: {}, config: {} };

describe('UploadButtonComponent', () => {
	let filesRepository: { handleFileList$: ReturnType<typeof vi.fn> };
	let dragAndDropService: { isDragging$: BehaviorSubject<boolean> };

	beforeEach(async () => {
		filesRepository = {
			handleFileList$: vi.fn().mockReturnValue(of([{ result: { file } }])),
		};
		dragAndDropService = {
			isDragging$: new BehaviorSubject(false),
		};
		await TestBed.configureTestingModule({
			imports: [UploadButtonComponent],
			providers: [
				{ provide: FilesRepository, useValue: filesRepository },
				{ provide: DragAndDropService, useValue: dragAndDropService },
			],
		})
			.overrideComponent(UploadButtonComponent, { set: { imports: [], template: '<button #browseFileBtn></button>' } })
			.compileComponents();
	});

	it('reflects drag state from the drag and drop service', () => {
		const fixture = TestBed.createComponent(UploadButtonComponent);
		fixture.detectChanges();

		dragAndDropService.isDragging$.next(true);

		expect(fixture.componentInstance.isDragging()).toBe(true);
	});

	it('uploads selected files and emits uploaded entities', () => {
		const fixture = TestBed.createComponent(UploadButtonComponent);
		fixture.detectChanges();
		const emitSpy = vi.spyOn(fixture.componentInstance.uploadedFiles, 'emit');
		const fileList = [new File(['hello'], 'hello.txt')];

		fixture.componentInstance.handleFileInputEvent({ target: { files: fileList } } as unknown as Event);

		expect(filesRepository.handleFileList$).toHaveBeenCalledWith(fileList, { elementRef: expect.any(ElementRef) });
		expect(emitSpy).toHaveBeenCalledWith([file]);
	});

	it('clicks the hidden button when allowed or forced', () => {
		const fixture = TestBed.createComponent(UploadButtonComponent);
		fixture.detectChanges();
		const button = fixture.componentInstance.button().nativeElement;
		const clickSpy = vi.spyOn(button, 'click').mockImplementation(() => {});

		fixture.componentInstance.simulateClick();
		fixture.componentRef.setInput('openOnClick', false);
		fixture.detectChanges();
		fixture.componentInstance.simulateClick();
		fixture.componentInstance.simulateClick(true);

		expect(clickSpy).toHaveBeenCalledTimes(2);
	});

	it('exposes selectFile without throwing', () => {
		const component = TestBed.createComponent(UploadButtonComponent).componentInstance;

		expect(() => component.selectFile()).not.toThrow();
	});
});
