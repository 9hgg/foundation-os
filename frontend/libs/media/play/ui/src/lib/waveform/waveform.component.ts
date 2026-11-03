import { ChangeDetectionStrategy, Component, computed, effect, input, output, signal } from '@angular/core';
import { Audiogram, audiogramBars, audiogramUrlFor, decodeAudiogram, mayDecodeDirectly } from './audiogram';

/**
 * Renders a static waveform visualization from an audio or video URL.
 *
 * Loads the media via the Web Audio API, extracts peak amplitude data per bar,
 * and renders vertically-centred SVG bars. Bars before `progressRatio` are
 * painted with `playedColor`, the rest with `unplayedColor` — so the same
 * component works both as a decorative background (equal colors) and as the
 * track of a waveform seek bar.
 *
 * The optional `startTime` and `duration` inputs control which portion of the
 * audio is visualised. The decoded AudioBuffer is cached per URL so changing the
 * window only repeats the cheap peak-extraction step (no re-download).
 */
@Component({
	selector: 'lib-waveform',
	standalone: true,
	template: `
		@if (bars().length > 0) {
			<svg
				xmlns="http://www.w3.org/2000/svg"
				class="h-full w-full"
				[attr.viewBox]="svgViewBox()"
				preserveAspectRatio="none"
				aria-hidden="true"
			>
				@for (bar of bars(); track $index) {
					<rect
						[attr.x]="$index * BAR_SLOT_WIDTH + BAR_GAP"
						[attr.y]="(SVG_HEIGHT - bar) / 2"
						[attr.width]="BAR_WIDTH"
						[attr.height]="bar"
						[attr.fill]="$index < playedBarCount() ? playedColor() : unplayedColor()"
					/>
				}
			</svg>
		}
	`,
	styles: [
		`
			:host {
				display: block;
			}
		`,
	],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WaveformComponent {
	/** What a waveform draws when nothing says how long it is -- a player bar, where it is plenty. */
	readonly BAR_COUNT = 100;
	/**
	 * Bars per second for a caller that does say, which is the mix timeline.
	 *
	 * The same rate the processor never measures below, so a block draws what its file actually
	 * holds. A hundred bars is right for a player bar and wrong for a timeline: a 458s block there
	 * is 45,860 pixels wide, and a hundred bars across it is 458 pixels each -- three slabs and two
	 * gaps, whatever the sound did. Ten a second makes them ten pixels, which is a waveform.
	 */
	readonly BARS_PER_SECOND = 10;
	/**
	 * Where that stops growing. Ten a second is unbounded in a file's length, and a three-hour block
	 * would ask for a hundred thousand bars: past this they are drawn coarser rather than by the
	 * thousand, because nobody reads an hour-wide block bar by bar.
	 */
	readonly MAX_BAR_COUNT = 5000;
	readonly BAR_SLOT_WIDTH = 2;
	readonly BAR_GAP = 0.3;
	readonly BAR_WIDTH = 1.4; // BAR_SLOT_WIDTH - 2 * BAR_GAP
	readonly SVG_HEIGHT = 100;
	readonly MIN_BAR_HEIGHT = 2;

	audioUrl = input<string | null | undefined>(null);
	/**
	 * The file's precomputed audiogram, if it has one.
	 *
	 * Preferred over measuring `audioUrl`, which means downloading the whole media file to look at
	 * it -- the listener pays for it twice, the owner is billed for the second one, and a long
	 * enough file cannot be decoded in a tab at all. A file processed before audiograms existed has
	 * none, and that is the ordinary case rather than an error: the old path still works.
	 */
	audiogramUrl = input<string | null | undefined>(null);
	/** Offset into the source file in seconds from which to start the waveform. Defaults to 0. */
	startTime = input<number | null | undefined>(null);
	/** Duration in seconds of the window to display. Defaults to the full file duration. */
	duration = input<number | null | undefined>(null);

	/** Fraction (0..1) of the waveform considered "played". */
	progressRatio = input<number>(0);
	/** Color of played bars (defaults to current text color). */
	playedColor = input<string>('currentColor');
	/** Color of not-yet-played bars (defaults to current text color). */
	unplayedColor = input<string>('currentColor');

	bars = signal<number[]>([]);

	/**
	 * Whether there is actually a drawing here.
	 *
	 * A seek bar hides its own track behind the waveform, so it has to know when there is no
	 * waveform to hide behind -- a file with no sound in it, or one not measured yet -- or a
	 * listener is left with nothing to aim at.
	 */
	hasBars = output<boolean>();

	/**
	 * How many bars to draw: `BAR_COUNT` unless the caller named a duration, and never fewer than
	 * it, so nothing draws coarser than it did before.
	 */
	barCount = computed(() => {
		const duration = this.duration();
		if (!duration || duration <= 0) return this.BAR_COUNT;
		return Math.min(this.MAX_BAR_COUNT, Math.max(this.BAR_COUNT, Math.ceil(duration * this.BARS_PER_SECOND)));
	});

	/** Follows the bars actually drawn, not the bars asked for: the two differ until they load. */
	svgViewBox = computed(() => `0 0 ${this.bars().length * this.BAR_SLOT_WIDTH} ${this.SVG_HEIGHT}`);

	playedBarCount = computed(() => {
		const ratio = Math.min(1, Math.max(0, this.progressRatio()));
		return Math.round(ratio * this.bars().length);
	});

	/** Tracks the most-recently-requested URL to discard stale async results. */
	private _currentUrl: string | null = null;
	/** Cached decoded audio buffer, keyed by URL to avoid redundant network fetches. */
	private _cachedUrl: string | null = null;
	private _cachedAudioBuffer: AudioBuffer | null = null;
	private _cachedAudiogramUrl: string | null = null;
	private _cachedAudiogram: Audiogram | null = null;

	constructor() {
		effect(() => this.hasBars.emit(this.bars().length > 0));

		effect(() => {
			const url = this.audioUrl();
			// Derived from the media address unless a caller names one: the variant is in the path,
			// so anything that knows how to play a file already knows where its drawing is.
			const audiogramUrl = this.audiogramUrl() ?? audiogramUrlFor(url);
			const startTime = this.startTime();
			const duration = this.duration();

			if (audiogramUrl) {
				if (audiogramUrl === this._cachedAudiogramUrl && this._cachedAudiogram) {
					this._currentUrl = audiogramUrl;
					this.bars.set(this._barsFromAudiogram(this._cachedAudiogram, startTime, duration));
					return;
				}
				void this._loadAudiogram(audiogramUrl);
				return;
			}

			if (!url) {
				this._currentUrl = null;
				this._cachedUrl = null;
				this._cachedAudioBuffer = null;
				this.bars.set([]);
				return;
			}

			// Cache hit: AudioBuffer already decoded for this URL — re-extract cheaply.
			if (url === this._cachedUrl && this._cachedAudioBuffer) {
				// Update _currentUrl so any in-flight fetch for a different URL is discarded.
				this._currentUrl = url;
				this.bars.set(this._extractPeaks(this._cachedAudioBuffer, startTime ?? 0, duration ?? null));
				return;
			}

			// Cache miss. Same rule: never download a listener's episode to draw it.
			if (mayDecodeDirectly(url)) void this._loadWaveform(url);
			else this.bars.set([]);
		});
	}

	private _barsFromAudiogram(audiogram: Audiogram, startTime: number | null | undefined, duration: number | null | undefined): number[] {
		return audiogramBars(audiogram, this.barCount(), startTime ?? null, duration ?? null).map((value) =>
			Math.max(this.MIN_BAR_HEIGHT, value * this.SVG_HEIGHT)
		);
	}

	/** A few kilobytes, already measured, instead of the media file and a decode. */
	private async _loadAudiogram(url: string): Promise<void> {
		this._currentUrl = url;
		this.bars.set([]);

		try {
			const response = await fetch(url);
			if (this._currentUrl !== url) return;
			if (!response.ok) return;

			const audiogram = decodeAudiogram(await response.arrayBuffer());
			if (this._currentUrl !== url || !audiogram) {
				// No audiogram here. Measuring the audio ourselves is the old way and still works,
				// but only where the bytes are not a listener's to pay for -- see mayDecodeDirectly.
				const mediaUrl = this.audioUrl();
				if (this._currentUrl === url && !audiogram && mayDecodeDirectly(mediaUrl)) void this._loadWaveform(mediaUrl as string);
				return;
			}

			this._cachedAudiogramUrl = url;
			this._cachedAudiogram = audiogram;
			this.bars.set(this._barsFromAudiogram(audiogram, this.startTime(), this.duration()));
		} catch {
			// Decorative: a drawing that fails to load is not worth interrupting a page for.
		}
	}

	private async _loadWaveform(url: string): Promise<void> {
		this._currentUrl = url;
		this.bars.set([]);

		try {
			// Discard stale requests before starting expensive work
			if (this._currentUrl !== url) return;

			const response = await fetch(url);
			if (this._currentUrl !== url) return;

			if (!response.ok) {
				console.warn(`[WaveformComponent] Failed to fetch audio (${response.status}): ${url}`);
				return;
			}

			const arrayBuffer = await response.arrayBuffer();
			if (this._currentUrl !== url) return;

			// OfflineAudioContext is designed for non-realtime processing and doesn't
			// require explicit cleanup like AudioContext does.
			const offlineCtx = new OfflineAudioContext(1, 1, 44100);
			const audioBuffer = await offlineCtx.decodeAudioData(arrayBuffer);
			if (this._currentUrl !== url) return;

			// Populate cache so subsequent startTime/duration changes are handled cheaply.
			// Guard once more: although no await separates us from the check above, being
			// explicit here makes the invariant clear for future readers.
			if (this._currentUrl !== url) return;
			this._cachedUrl = url;
			this._cachedAudioBuffer = audioBuffer;

			// Read the current signal values at completion time to ensure we use the
			// most recent window even if inputs changed while the fetch was in-flight.
			this.bars.set(this._extractPeaks(audioBuffer, this.startTime() ?? 0, this.duration() ?? null));
		} catch {
			// Silently ignore — waveform is purely decorative, errors are non-critical
		}
	}

	/**
	 * Extract `barCount` peak amplitude values from `audioBuffer` within the window
	 * `[offsetSecs, offsetSecs + durationSecs]` (clamped to the file's actual duration).
	 * When `durationSecs` is null the whole file (from `offsetSecs` onward) is used.
	 */
	private _extractPeaks(audioBuffer: AudioBuffer, offsetSecs: number, durationSecs: number | null): number[] {
		const barCount = this.barCount();
		const sampleRate = audioBuffer.sampleRate;
		const totalSamples = audioBuffer.length;

		const startSample = Math.max(0, Math.round(offsetSecs * sampleRate));
		const endSample = durationSecs !== null ? Math.min(totalSamples, startSample + Math.round(durationSecs * sampleRate)) : totalSamples;

		const rangeLength = endSample - startSample;
		if (rangeLength <= 0) {
			return new Array<number>(barCount).fill(this.MIN_BAR_HEIGHT);
		}

		const channelData = audioBuffer.getChannelData(0);
		const samplesPerBar = Math.max(1, Math.floor(rangeLength / barCount));
		const bars: number[] = [];

		for (let i = 0; i < barCount; i++) {
			const start = startSample + i * samplesPerBar;
			const end = Math.min(start + samplesPerBar, endSample);

			// Pad with minimum bar height if we have stepped past the end of the range
			if (start >= endSample) {
				bars.push(this.MIN_BAR_HEIGHT);
				continue;
			}

			let peak = 0;
			for (let j = start; j < end; j++) {
				const abs = Math.abs(channelData[j]);
				if (abs > peak) peak = abs;
			}

			// Scale peak (0–1) to SVG_HEIGHT; enforce a minimum height for visibility
			bars.push(Math.max(this.MIN_BAR_HEIGHT, peak * this.SVG_HEIGHT));
		}

		return bars;
	}
}
