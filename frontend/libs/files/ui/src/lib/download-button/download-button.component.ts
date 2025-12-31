import { AlternativeFormat, EntityFile } from '@foundation/files/models';
import { convertToUrl } from '@foundation/files/state';
import { TranslationsRepository } from '@foundation/translations/state';
import { TranslationService } from '@foundation/translations/services';
import { TranslationTableComponent } from '@foundation/translations/ui';
import { TranslatePipe, TranslateDirective } from '@foundation/translations/services';
import { RequestService } from '@foundation/network/services';
import { OctetHumanReadablePipe } from '@foundation/utils';
import { CdkMenu, CdkMenuItem, CdkMenuModule } from '@angular/cdk/menu';
import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input, signal, ViewEncapsulation } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { NEVER, switchMap, tap } from 'rxjs';

@Component({
	selector: 'lib-download-button',
	standalone: true,
	imports: [CommonModule, TranslateDirective, TranslatePipe, OctetHumanReadablePipe, CdkMenuModule, CdkMenu, CdkMenuItem],
	templateUrl: './download-button.component.html',
	changeDetection: ChangeDetectionStrategy.OnPush,
	encapsulation: ViewEncapsulation.None,
})
export class DownloadButtonComponent {
	private _requestService = inject(RequestService);

	// Input signal for the entity file ID
	entityFileId = input.required<string>();

	// Signal to store the loaded entity file
	entityFile = signal<EntityFile | null>(null);

	// Compute available alternatives from the entity file
	alternatives = computed(() => {
		const entityFile = this.entityFile();
		if (!entityFile) return [];

		const alternatives: Array<{ label: string; extension: string; size?: number; url: string }> = [];

		// Add the original file
		alternatives.push({
			label: 'Original',
			extension: entityFile.extension || entityFile.extensionClient || 'unknown',
			size: entityFile.size,
			url: convertToUrl(entityFile, 'original', true),
		});

		// Add alternative formats
		if (entityFile.extra?.alternativeFormats) {
			entityFile.extra.alternativeFormats.forEach((alt: AlternativeFormat) => {
				alternatives.push({
					label: alt.description || alt.extension.toUpperCase(),
					extension: alt.extension,
					size: alt.size,
					url: convertToUrl(entityFile, alt.storageSuffix, true),
				});
			});
		}

		return alternatives;
	});

	constructor() {
		// Load file details when entityFileId changes
		toObservable(this.entityFileId)
			.pipe(
				takeUntilDestroyed(),
				switchMap((entityFileId) => {
					if (!entityFileId) return NEVER;

					if (entityFileId.length !== 36) {
						console.warn('Invalid entityFileId length:', entityFileId);
						return NEVER; // Handle invalid ID length
					}

					return this._requestService
						.getBasic$<{
							file: EntityFile;
						}>('/api/files/storage/read/' + entityFileId + '/details')
						.pipe(
							tap((response) => {
								if (response && response.result && response.result.file) {
									this.entityFile.set(response.result.file);
								}
							})
						);
				})
			)
			.subscribe();
	}

	downloadAlternative(url: string, event: Event) {
		event.stopPropagation();
		// Create a temporary link element and trigger download
		const link = document.createElement('a');
		link.href = url;
		link.download = '';
		link.target = '_blank';
		document.body.appendChild(link);
		link.click();
		document.body.removeChild(link);
	}
}
