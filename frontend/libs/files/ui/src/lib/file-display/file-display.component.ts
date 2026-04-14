import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { EntityFile } from '@foundation/files/models';
import { convertToUrl } from '@foundation/files/state';
import { PlayButtonComponent, SubtitleLoaderComponent } from '@foundation/media/play/ui';

@Component({
	selector: 'lib-file-display',
	standalone: true,
	imports: [CommonModule, PlayButtonComponent, SubtitleLoaderComponent],
	templateUrl: './file-display.component.html',
	changeDetection: ChangeDetectionStrategy.OnPush,
	styleUrl: './file-display.component.css',
})
export class FileDisplayComponent {
	private _sanitizer = inject(DomSanitizer);

	entityFile = input.required<EntityFile>();

	getFileUrl(entityFile: EntityFile, alternative: string = 'default'): string {
		return convertToUrl(entityFile, alternative);
	}

	getSafeFileResourceUrl(entityFile: EntityFile, alternative: string = 'default'): SafeResourceUrl {
		const fileUrl = this.getFileUrl(entityFile, alternative);
		return this._sanitizer.bypassSecurityTrustResourceUrl(fileUrl);
	}

	getSafeOfficeViewerUrl(entityFile: EntityFile): SafeResourceUrl {
		const fileUrl = this.getFileUrl(entityFile);
		const officeViewerUrl = `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(fileUrl)}`;
		return this._sanitizer.bypassSecurityTrustResourceUrl(officeViewerUrl);
	}

	hasPdfAlternative(entityFile: EntityFile): boolean {
		const alternatives = entityFile.extra?.alternativeFormats ?? [];
		for (const alternative of alternatives) {
			if (alternative.storageSuffix !== 'pdf') continue;
			if (alternative.extension === '.pdf') return true;
			if (alternative.mime === 'application/pdf') return true;
			if (alternative.kind === 'document') return true;
			return true;
		}
		return false;
	}
}
