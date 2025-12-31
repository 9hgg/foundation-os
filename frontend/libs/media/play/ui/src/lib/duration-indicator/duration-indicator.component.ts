import { FilesRepository } from '@foundation/files/state';
import { DurationPipe } from '@foundation/utils';
import { Component, inject, input, model } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { combineLatest, filter, switchMap, tap } from 'rxjs';

@Component({
	selector: 'lib-duration-indicator',
	templateUrl: './duration-indicator.component.html',
	styleUrl: './duration-indicator.component.css',
	standalone: true,
	imports: [DurationPipe],
})
export class DurationIndicatorComponent {
	private _filesRepository = inject(FilesRepository);
	entityFileId = input<string | null>(null);
	alternative = input<string>('original');
	fileDuration = model<number>(0);

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
				tap((f) => {
					// const alternative = this.alternative();
					// const alternativeFormat = f.extra?.alternativeFormats?.find((a) => {
					// 	return a.storageSuffix === alternative;
					// });
					// console.log('File was received for duration:', alternativeFormat);

					// if (!alternativeFormat) return;
					this.fileDuration.set(f.extra.duration ?? f.config.clientDuration ?? 0);
				})
			)
			.subscribe();
	}
}
