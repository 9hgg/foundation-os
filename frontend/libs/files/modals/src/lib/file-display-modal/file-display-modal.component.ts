/* eslint-disable @angular-eslint/prefer-inject */
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, HostListener, Inject, computed, signal } from '@angular/core';
import { EntityFile } from '@foundation/files/models';
import { convertToUrl } from '@foundation/files/state';
import { FileDisplayComponent } from '@foundation/files/ui';

export interface FileDisplayModalAction {
	label: string;
	onClick: (file: EntityFile) => void;
	/** What to do once onClick has run. Defaults to 'next' — act-and-advance. */
	afterClick?: 'close' | 'next' | 'prev';
	variant?: 'primary' | 'ghost' | 'error';
}

export interface FileDisplayModalData {
	entityFile: EntityFile;
	title?: string;
	/** When provided (2+ entries), the modal becomes a slideshow: arrow buttons + arrow-key navigation between them. */
	files?: EntityFile[];
	/** Optional actions shown in a footer — e.g. Confirmer / Ignorer the current file, then advance. */
	actions?: FileDisplayModalAction[];
	highlightBox?: { x: number; y: number; width: number; height: number };
}

@Component({
	selector: 'lib-file-display-modal',
	standalone: true,
	imports: [FileDisplayComponent],
	templateUrl: './file-display-modal.component.html',
	changeDetection: ChangeDetectionStrategy.OnPush,
	styleUrl: './file-display-modal.component.css',
})
export class FileDisplayModalComponent {
	files: EntityFile[];
	currentIndex = signal(0);

	isSlideshow = computed(() => this.files.length > 1);
	currentFile = computed(() => this.files[this.currentIndex()] ?? this.data.entityFile);
	currentTitle = computed(() => this.data.title || this.currentFile().publicFilename || this.currentFile().originalFilename || this.currentFile().id);

	private _naturalSize = signal<{ w: number; h: number } | null>(null);
	showHighlight = computed(() => !!this.data.highlightBox && this.currentFile().id === this.data.entityFile.id);
	highlightImageUrl = computed(() => convertToUrl(this.currentFile()));
	highlightStyle = computed(() => {
		const box = this.data.highlightBox;
		if (!box) return null;
		const source = this.data.entityFile.extra;
		const natural = this._naturalSize();
		const w = source?.width || natural?.w;
		const h = source?.height || natural?.h;
		if (!w || !h) return null;
		return {
			left: `${(box.x / w) * 100}%`,
			top: `${(box.y / h) * 100}%`,
			width: `${(box.width / w) * 100}%`,
			height: `${(box.height / h) * 100}%`,
		};
	});

	onHighlightImageLoad(event: Event) {
		const img = event.target as HTMLImageElement;
		this._naturalSize.set({ w: img.naturalWidth, h: img.naturalHeight });
	}

	constructor(
		private _dialogRef: DialogRef<void, FileDisplayModalComponent>,
		@Inject(DIALOG_DATA) public data: FileDisplayModalData
	) {
		this.files = data.files && data.files.length > 0 ? data.files : [data.entityFile];
		const initialIndex = this.files.findIndex((file) => file.id === data.entityFile.id);
		this.currentIndex.set(initialIndex >= 0 ? initialIndex : 0);
	}

	@HostListener('document:keydown', ['$event'])
	onKeydown(event: KeyboardEvent) {
		if (!this.isSlideshow()) return;
		if (event.key === 'ArrowLeft') this.previous();
		if (event.key === 'ArrowRight') this.next();
	}

	previous() {
		this.currentIndex.update((index) => (index - 1 + this.files.length) % this.files.length);
	}

	next() {
		this.currentIndex.update((index) => (index + 1) % this.files.length);
	}

	runAction(action: FileDisplayModalAction) {
		action.onClick(this.currentFile());
		const afterClick = action.afterClick ?? 'next';
		if (afterClick === 'close') this.close();
		else if (afterClick === 'prev') this.previous();
		else this.next();
	}

	close() {
		this._dialogRef.close();
	}
}
