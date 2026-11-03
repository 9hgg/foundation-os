import { AsyncPipe } from '@angular/common';
import { convertToUrl, FilesRepository } from '@foundation/files/state';
import { NotificationService } from '@foundation/notification';
import { TranslatePipe } from '@foundation/translations/services';
import { Component, computed, inject, input, model, output } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { combineLatest, EMPTY, filter, from, switchMap, tap } from 'rxjs';
import { formatCueTimestamp, parseSubtitleCues } from './subtitle-cues';

/**
 * The words of an SRT, without its cue numbers and timings.
 *
 * A transcript shown beside a file is read, not seeked: the cues are scaffolding for a player and
 * only get in the way here.
 */
export function subtitleCuesAsProse(subtitle: string): string {
	return subtitle
		.split(/\r?\n/)
		.filter((line) => line.trim() && !/^\d+$/.test(line.trim()) && !line.includes('-->'))
		.join(' ')
		.trim();
}

@Component({
	selector: 'lib-subtitle-loader',
	templateUrl: './subtitle-loader.component.html',
	styleUrl: './subtitle-loader.component.css',
	standalone: true,
	imports: [AsyncPipe, TranslatePipe],
})
export class SubtitleLoaderComponent {
	private _filesRepository = inject(FilesRepository);
	private _notificationService = inject(NotificationService);
	entityFileId = input<string | null>(null);
	/**
	 * Fetch this address instead of resolving the file entity.
	 *
	 * A listener on a public or link-shared collection page holds no rights on the file, so looking
	 * it up would fail for exactly the people the page exists for. They get a proxy URL -- the same
	 * one that serves the audio, asked for its transcript alternative -- which is also what makes
	 * the transcript stop when the link is withdrawn.
	 */
	url = input<string | null>(null);
	alternative = input<string>('whisper_transcript_srt');
	/**
	 * `cues` keeps the SRT as it is; `prose` shows the words alone, for reading beside a file;
	 * `follow` reads it as a transcript that knows where the player is -- each line with its
	 * timestamp, the one being spoken marked, and any line clickable to jump there.
	 */
	display = input<'cues' | 'prose' | 'follow'>('cues');
	/** Where the media is, in seconds. Only `follow` reads it. */
	currentTime = input<number | null>(null);
	/**
	 * Somebody asked to hear a line, in seconds from the start.
	 *
	 * An event rather than a two-way `currentTime`: this component has no idea what is playing it,
	 * and the page that mounted it is the one holding the player.
	 */
	seek = output<number>();
	subtitle = model<string>('');

	text = computed(() => (this.display() === 'prose' ? subtitleCuesAsProse(this.subtitle()) : this.subtitle()));

	cues = computed(() => (this.display() === 'follow' ? parseSubtitleCues(this.subtitle()) : []));

	/**
	 * Everything already said is marked, rather than only the sentence being spoken.
	 *
	 * A single lit line is a cursor: it tells you where you are and nothing about where you have
	 * been, and in the silence between two cues it lights nothing at all, so the transcript looks
	 * like it stopped following. Marking what has been said reads as progress through the text and
	 * has an answer at every moment.
	 */
	hasBeenSaid(cue: { start: number }): boolean {
		const currentTime = this.currentTime();
		return currentTime !== null && cue.start <= currentTime;
	}

	formatTimestamp = formatCueTimestamp;

	constructor() {
		toObservable(this.url)
			.pipe(
				takeUntilDestroyed(),
				filter((url): url is string => !!url),
				switchMap((url) => from(this._filesRepository.fetchTextContent(url))),
				tap((content) => this.subtitle.set(content || ''))
			)
			.subscribe();

		combineLatest([
			//
			toObservable(this.entityFileId).pipe(filter((entityFileId): entityFileId is string => !!entityFileId)),
			toObservable(this.alternative),
		])
			.pipe(
				takeUntilDestroyed(),
				switchMap(([entityFileId]) => this._filesRepository.store.getObjectById$$$(entityFileId, true, true).$),
				filter((f) => !!f),
				switchMap((f) => {
					const alternative = this.alternative();
					const subtitleAlternative = f.extra?.alternativeFormats?.find((a) => {
						return a.storageSuffix === alternative && a.mime.includes('text');
					});
					if (!subtitleAlternative) return EMPTY;

					// the alternative "exists" and is of type text: let's get it
					const url = convertToUrl(f.id, subtitleAlternative.storageSuffix);
					return from(this._filesRepository.fetchTextContent(url));
				}),
				tap((r) => {
					this.subtitle.set(r || '');
				})
			)
			.subscribe();
	}

	copyToClipboard() {
		const subtitleText = this.subtitle();
		if (subtitleText) {
			navigator.clipboard.writeText(subtitleText).then(() => {
				this._notificationService.snack('Text copied to clipboard successfully!', undefined, { dialogTarget: 'copy-subtitle', autoCloseMs: 2000 });
			});
		}
	}
}
