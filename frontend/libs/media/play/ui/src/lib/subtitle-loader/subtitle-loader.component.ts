import { convertToUrl, FilesRepository } from '@foundation/files/state';
import { NotificationService } from '@foundation/notification';
import { Component, inject, input, model } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { combineLatest, EMPTY, filter, from, switchMap, tap } from 'rxjs';

@Component({
	selector: 'lib-subtitle-loader',
	templateUrl: './subtitle-loader.component.html',
	styleUrl: './subtitle-loader.component.css',
	standalone: true,
	imports: [],
})
export class SubtitleLoaderComponent {
	private _filesRepository = inject(FilesRepository);
	private _notificationService = inject(NotificationService);
	entityFileId = input<string | null>(null);
	alternative = input<string>('whisper_transcript_srt');
	subtitle = model<string>('');

	constructor() {
		combineLatest([
			//
			toObservable(this.entityFileId).pipe(filter((entityFileId): entityFileId is string => !!entityFileId)),
			toObservable(this.alternative),
		])
			.pipe(
				takeUntilDestroyed(),
				switchMap(([entityFileId, alternative]) => this._filesRepository.store.getObjectById$$$(entityFileId, true, true).$),
				filter((f) => !!f),
				switchMap((f) => {
					const alternative = this.alternative();
					const subtitleAlternative = f.extra?.alternativeFormats?.find((a) => {
						return a.storageSuffix === alternative && a.mime.includes('text');
					});
					console.log('File was received for transcript:', subtitleAlternative);

					if (!subtitleAlternative) return EMPTY;

					// the alternative "exists" and is of type text: let's get it
					const url = convertToUrl(f.id, subtitleAlternative.storageSuffix);
					return from(this._filesRepository.fetchTextContent(url));
				}),
				tap((r) => {
					this.subtitle.set(r || '<no transcript>');
				})
			)
			.subscribe();
	}

	copyToClipboard() {
		const subtitleText = this.subtitle();
		if (subtitleText && subtitleText !== '<no transcript>') {
			navigator.clipboard.writeText(subtitleText).then(() => {
				this._notificationService.snack('Text copied to clipboard successfully!', undefined, { dialogTarget: 'copy-subtitle', autoCloseMs: 2000 });
			});
		}
	}
}
