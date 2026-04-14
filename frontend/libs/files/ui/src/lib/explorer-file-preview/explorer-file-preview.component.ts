import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { EntityFile } from '@foundation/files/models';
import { OctetHumanReadablePipe } from '@foundation/utils';
import { DownloadButtonComponent } from '../download-button/download-button.component';
import { FileDisplayComponent } from '../file-display/file-display.component';

@Component({
	selector: 'lib-explorer-file-preview',
	imports: [DatePipe, FileDisplayComponent, DownloadButtonComponent, OctetHumanReadablePipe],
	changeDetection: ChangeDetectionStrategy.OnPush,
	template: `
		@let file = entityFile();
		@if (file) {
			<div class="flex h-full flex-col gap-4 p-4">
				<!-- File display / preview -->
				<div class="bg-base-200 flex min-h-48 items-center justify-center overflow-hidden rounded-lg">
					<lib-file-display [entityFile]="file" />
				</div>

				<!-- File info -->
				<div class="flex flex-col gap-2">
					<h3 class="text-base-content text-base font-bold break-all">{{ file.publicFilename || file.originalFilename || 'Unnamed file' }}</h3>
					<div class="text-base-content/60 flex flex-col gap-1 text-sm">
						@if (file.kind) {
							<div class="flex justify-between">
								<span class="font-medium">Type</span>
								<span class="badge badge-ghost badge-sm capitalize">{{ file.kind }}</span>
							</div>
						}
						@if (file.extension) {
							<div class="flex justify-between">
								<span class="font-medium">Extension</span>
								<span>.{{ file.extension }}</span>
							</div>
						}
						@if (file.size) {
							<div class="flex justify-between">
								<span class="font-medium">Size</span>
								<span>{{ file.size | octetHumanReadable }}</span>
							</div>
						}
						@if (file.mime) {
							<div class="flex justify-between">
								<span class="font-medium">MIME</span>
								<span class="font-mono text-xs">{{ file.mime }}</span>
							</div>
						}
						@if (fileDimensions()) {
							<div class="flex justify-between">
								<span class="font-medium">Dimensions</span>
								<span>{{ fileDimensions() }}</span>
							</div>
						}
						@if (file.extra.duration) {
							<div class="flex justify-between">
								<span class="font-medium">Duration</span>
								<span>{{ fileDurationFormatted() }}</span>
							</div>
						}
						@if (file.timeCreated) {
							<div class="flex justify-between">
								<span class="font-medium">Created</span>
								<span>{{ file.timeCreated | date: 'medium' }}</span>
							</div>
						}
					</div>
				</div>

				<!-- Actions -->
				<div class="mt-auto">
					<lib-download-button [entityFileId]="file.id" />
				</div>
			</div>
		}
	`,
})
export class ExplorerFilePreviewComponent {
	resource = input<EntityFile | null>(null);

	entityFile = computed<EntityFile | null>(() => {
		const r = this.resource();
		return r ?? null;
	});

	fileDimensions = computed(() => {
		const file = this.entityFile();
		if (file?.extra?.width && file.extra.height) {
			return `${file.extra.width} × ${file.extra.height}`;
		}
		return null;
	});

	fileDurationFormatted = computed(() => {
		const file = this.entityFile();
		const duration = file?.extra?.duration;
		if (!duration) return null;
		const minutes = Math.floor(duration / 60);
		const seconds = Math.floor(duration % 60);
		return `${minutes}:${seconds.toString().padStart(2, '0')}`;
	});
}
