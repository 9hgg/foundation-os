/* eslint-disable @angular-eslint/prefer-inject */
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, Inject, OnDestroy, signal } from '@angular/core';
import { InlinePlayerComponent } from '@foundation/media/play/ui';
import { TranslateDirective } from '@foundation/translations/services';
import { RecordActionsComponent } from '../record-actions/record-actions.component';

interface CollectedRecording {
	id: string;
	file: File;
	url: string;
	mediaType: 'audio' | 'video';
}

export interface RecordingModalData {
	displayAudioBtn?: boolean;
	displayVideoBtn?: boolean;
	displayScreenCaptureBtn?: boolean;
	displayScreenCaptureWithVideoBtn?: boolean;
	/** Maximum number of recordings allowed (default: 1) */
	maxFiles?: number;
}

export interface RecordingModalResult {
	files: File[];
}

@Component({
	selector: 'lib-recording-modal',
	standalone: true,
	imports: [TranslateDirective, RecordActionsComponent, InlinePlayerComponent],
	template: `
		<div class="bg-base-100 flex w-full max-w-2xl flex-col gap-4 rounded-2xl p-6 shadow-xl">
			<div class="flex items-center justify-between">
				<h2
					class="text-lg font-bold"
					[translate]
				>
					Record
				</h2>
				<button
					class="btn btn-ghost btn-sm btn-circle"
					(click)="cancel()"
					aria-label="Close"
				>
					✕
				</button>
			</div>

			<div class="border-base-300 bg-base-200/40 h-112 w-full overflow-hidden rounded-xl border">
				<lib-record-actions
					class="block h-full w-full"
					[recordingTargetName]="'host-message-recorder'"
					[displayAudioBtn]="data.displayAudioBtn ?? false"
					[displayVideoBtn]="data.displayVideoBtn ?? false"
					[displayScreenCaptureWithVideoBtn]="data.displayScreenCaptureWithVideoBtn ?? false"
					[displayScreenCaptureBtn]="data.displayScreenCaptureBtn ?? false"
					[displayUploadBtn]="false"
					[maxDuration]="300"
					[backgroundColor]="'var(--color-base-200)'"
					[fontColor]="'var(--color-base-content)'"
					[borderColor]="'var(--color-base-300)'"
					[borderRadius]="'0.5rem'"
					(fileAvailableEvent)="onFileProduced($event)"
				></lib-record-actions>
			</div>

			<!-- Collected recordings list -->
			@if (collectedFiles().length > 0) {
				<div class="space-y-2">
					<p
						class="text-sm font-semibold opacity-60"
						[translate]
					>
						Ready to use
					</p>
					@for (recording of collectedFiles(); track recording.id) {
						<div class="mx-auto w-full max-w-sm">
							<lib-inline-player
								[mediaUrl]="recording.url"
								[mediaType]="recording.mediaType"
							></lib-inline-player>
						</div>
					}
				</div>
			}

			<!-- Action buttons -->
			<div class="flex justify-end gap-2 pt-2">
				<button
					class="btn btn-ghost btn-sm"
					(click)="cancel()"
					[translate]
				>
					Cancel
				</button>
				<button
					class="btn btn-primary btn-sm"
					[disabled]="collectedFiles().length === 0"
					(click)="confirm()"
					[translate]
				>
					Use Recording
				</button>
			</div>
		</div>
	`,
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RecordingModalComponent implements OnDestroy {
	collectedFiles = signal<CollectedRecording[]>([]);

	constructor(
		private _dialogRef: DialogRef<RecordingModalResult, RecordingModalComponent>,
		@Inject(DIALOG_DATA) public data: RecordingModalData
	) {}

	onFileProduced(file: File): void {
		if (!file) return;
		const recording = this._toRecording(file);
		const maxFiles = this.data.maxFiles ?? 1;
		const existing = this.collectedFiles();
		if (existing.length >= maxFiles) {
			existing.forEach((collected) => URL.revokeObjectURL(collected.url));
			this.collectedFiles.set([recording]);
		} else {
			this.collectedFiles.set([...existing, recording]);
		}
	}

	confirm(): void {
		this._dialogRef.close({ files: this.collectedFiles().map((recording) => recording.file) });
	}

	cancel(): void {
		this._dialogRef.close({ files: [] });
	}

	ngOnDestroy(): void {
		this.collectedFiles().forEach((recording) => URL.revokeObjectURL(recording.url));
	}

	private _toRecording(file: File): CollectedRecording {
		const id = crypto.randomUUID();
		const url = URL.createObjectURL(file);
		const mediaType: 'audio' | 'video' = file.type.startsWith('video') ? 'video' : 'audio';
		return { id, file, url, mediaType };
	}
}
