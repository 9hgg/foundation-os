import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { TwDocumentIcon, TwFileIcon, TwMicrophoneIcon } from '@foundation/icons';
import { EntityFile } from '@foundation/files/models';
import { convertToUrl } from '@foundation/files/state';

@Component({
	selector: 'lib-file-thumbnail',
	standalone: true,
	imports: [CommonModule, TwMicrophoneIcon, TwDocumentIcon, TwFileIcon],
	templateUrl: './file-thumbnail.component.html',
	changeDetection: ChangeDetectionStrategy.OnPush,
	styleUrl: './file-thumbnail.component.css',
})
export class FileThumbnailComponent {
	entityFile = input<EntityFile | null>(null);
	file = computed(() => this.entityFile());
	thumbnailUrl = computed(() => {
		const file = this.file();
		if (!file) return null;
		return convertToUrl(file, 'thumbnail');
	});
	defaultUrl = computed(() => {
		const file = this.file();
		if (!file) return null;
		return convertToUrl(file);
	});
	private _failedDocumentThumbnailIds = signal<Set<string>>(new Set());
	canShowDocumentThumbnail = computed(() => {
		const file = this.file();
		if (!file || file.kind !== 'document' || !file.id) return false;
		if (this._failedDocumentThumbnailIds().has(file.id)) return false;
		const alternatives = file.extra?.alternativeFormats ?? [];
		const hasThumbnailAlternative = alternatives.some((alternative) => alternative.storageSuffix === 'thumbnail' && alternative.kind === 'image');
		return hasThumbnailAlternative;
	});

	private _alreadyTried = new Set<string>();

	onImageError(event: Event, fallbackSrc: string) {
		if (this._alreadyTried.has(fallbackSrc)) return;
		this._alreadyTried.add(fallbackSrc);
		const element = event.target as HTMLImageElement;
		element.src = fallbackSrc;
	}

	onDocumentThumbnailError(fileId: string | undefined) {
		if (!fileId) return;
		const ids = new Set(this._failedDocumentThumbnailIds());
		ids.add(fileId);
		this._failedDocumentThumbnailIds.set(ids);
	}
}
