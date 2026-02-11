import { CommonModule } from '@angular/common';
import { HttpClient, HttpEventType, HttpHeaders } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, ElementRef, EventEmitter, HostListener, Output, Renderer2, effect, inject, input, signal, viewChild } from '@angular/core';
import { InterceptorSkipHeader } from '@foundation/auth/state';
import { DragAndDropService, DropDirective } from '@foundation/utils';
import { EMPTY, combineLatest, interval, map, of, shareReplay, skipUntil, switchMap, take, tap } from 'rxjs';

import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { EntityFile } from '@foundation/files/models';
import { FilesRepository } from '@foundation/files/state';
import { TranslationsRepository } from '@foundation/translations/state';
import { TranslationService } from '@foundation/translations/services';
import { TranslationTableComponent } from '@foundation/translations/ui';
import { TranslatePipe, TranslateDirective } from '@foundation/translations/services';

@Component({
	selector: 'lib-upload-button',
	standalone: true,
	imports: [
		//
		CommonModule,
		FormsModule,
		TranslateDirective,
		DropDirective,
	],
	templateUrl: './upload-button.component.html',
	changeDetection: ChangeDetectionStrategy.OnPush,
	styleUrls: ['./upload-button.component.css'],
	host: {
		'(change)': 'handleFileInputEvent($event)',
	},
})
export class UploadButtonComponent {
	private _el = inject(ElementRef);
	private _filesRepository = inject(FilesRepository);

	// display properties
	height = input<string>('200px');
	width = input<string>('300px');
	accept = input<string>('*');

	openOnClick = input<boolean>(true);
	dropZoneActive = input<boolean>(false);
	dropZoneBackground = input<boolean>(false);
	isDragging = signal<boolean>(false);
	private _dad = inject(DragAndDropService);

	button = viewChild.required<ElementRef<HTMLButtonElement>>('browseFileBtn');

	@Output()
	uploadedFiles = new EventEmitter<(EntityFile | undefined)[]>();

	constructor() {
		// subscribe to drag state (true or false)
		this._dad.isDragging$
			.pipe(
				takeUntilDestroyed(),
				tap((isDragging) => {
					this.isDragging.set(isDragging);
					// if (isDragging) {
					// 	this.dragStartHandle();
					// }
				})
			)
			.subscribe();
	}

	/** Called when uploading multiple file at a time or no need to control the fileId */
	private _handleFileList(fileList: FileList | File[] | null) {
		this._filesRepository
			.handleFileList$(fileList, { elementRef: this._el })
			.pipe(map((res) => res.map((r) => r.result?.file)))
			.subscribe({
				next: (res) => {
					console.log('Upload is over 1:', res);
					this.uploadedFiles.emit(res);
				},
				complete: () => {
					console.log('Upload is over 2');
				},
			});
	}

	handleFileInputEvent(event: Event) {
		const target = event.target as HTMLInputElement;
		if (target?.files) {
			this._handleFileList(target.files);
		}
	}

	public selectFile() {
		console.log('select file');
	}

	public simulateClick(force = false) {
		if (this.openOnClick() || force) this.button().nativeElement.click();
	}
}
