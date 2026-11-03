import { DurationPipe } from '@foundation/utils';
import { ChangeDetectionStrategy, Component, computed, ElementRef, input, output, signal, viewChild } from '@angular/core';
import { WaveformComponent } from '../waveform/waveform.component';

/**
 * Presentational, accessible play/seek bar.
 *
 * It is intentionally decoupled from any player/playlist service: it only knows
 * about times (in seconds) and emits seek requests. This makes it reusable
 * (root player, form steps, mixes...) and testable in isolation.
 *
 * Colors default to DaisyUI semantic tokens so the bar looks native anywhere in
 * the app (and follows automatic dark mode). When it is rendered outside a
 * themed subtree (e.g. the global root player, which lives in the app shell and
 * therefore does NOT inherit a form's scoped theme css vars), the consumer can
 * pass the form's chosen colors through the *Color inputs so the bar still
 * respects the colors picked in the form builder.
 */
@Component({
	selector: 'lib-seek-bar',
	standalone: true,
	imports: [DurationPipe, WaveformComponent],
	templateUrl: './seek-bar.component.html',
	styleUrl: './seek-bar.component.css',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SeekBarComponent {
	/** Current playback position, in seconds. */
	currentTime = input<number>(0);
	/** Total duration of the current item, in seconds. */
	duration = input<number>(0);
	/** End of the buffered range, in seconds (0 when unknown). */
	bufferedEnd = input<number>(0);

	/** True while the media is still loading and cannot play yet. */
	loading = input<boolean>(false);
	/** True when the media element reported an error. */
	hasError = input<boolean>(false);
	/** Disables all interactions. */
	disabled = input<boolean>(false);

	/** Show the leading current-time / trailing duration labels around the track. */
	showTimeLabels = input<boolean>(true);
	/** Show how much is left, centred over the track. Answers "how long until this ends?". */
	showRemainingTime = input<boolean>(false);

	/**
	 * When set, the track renders the media's waveform (played part in
	 * `progressColor`, the rest in `trackColor`) instead of a plain bar.
	 */
	mediaUrl = input<string | null>(null);

	/** Keyboard seek increment for arrow keys, in seconds. */
	keyboardStepSeconds = input<number>(5);
	/** Keyboard seek increment for page up/down, in seconds. */
	keyboardPageSeconds = input<number>(10);

	/** Accessible label for the slider (translated by the consumer). */
	ariaLabel = input<string>('Seek');

	/*
	 * Colors. Defaults are DaisyUI tokens; consumers can override with explicit
	 * colors (e.g. a form's chosen text color) when the bar is not inside the
	 * themed subtree.
	 */
	trackColor = input<string>('var(--color-base-300)');
	bufferedColor = input<string>('var(--color-base-content)');
	progressColor = input<string>('var(--color-primary)');
	thumbColor = input<string>('var(--color-primary)');
	contentColor = input<string>('var(--color-base-content)');
	errorColor = input<string>('var(--color-error)');

	/** Final seek position requested by the user (click, drag end, keyboard). */
	seek = output<number>();
	/** Emitted when the user starts dragging the thumb. */
	scrubStart = output<void>();
	/** Live position while dragging (before commit). */
	scrubbing = output<number>();
	/** Emitted with the final position when the drag ends. */
	scrubEnd = output<number>();

	trackRef = viewChild.required<ElementRef<HTMLDivElement>>('track');

	/** True while the user is actively dragging. */
	isScrubbing = signal<boolean>(false);
	/** Preview position while dragging (null when not dragging). */
	private _scrubTime = signal<number | null>(null);
	/** Pointer ratio (0..1) while hovering, for the time tooltip. */
	private _hoverRatio = signal<number | null>(null);

	/** Sanitized, strictly-positive duration. */
	durationValue = computed(() => {
		const duration = this.duration();
		return Number.isFinite(duration) && duration > 0 ? duration : 0;
	});

	/** Position to render: the scrub preview while dragging, otherwise the real time. */
	displayTime = computed(() => {
		const scrubTime = this._scrubTime();
		return scrubTime !== null ? scrubTime : this.currentTime();
	});

	/** How much is left to play, from wherever the bar is showing. Never negative. */
	remainingTime = computed(() => {
		const remaining = this.durationValue() - this.displayTime();
		return remaining > 0 ? remaining : 0;
	});

	progressPercent = computed(() => this._toPercent(this.displayTime()));
	bufferedPercent = computed(() => this._toPercent(this.bufferedEnd()));

	/** Whether to render the waveform track variant. */
	showWaveform = computed(() => !!this.mediaUrl());

	/** Set by the waveform itself. Until it says it drew something the plain track stays visible: a
	 * file with no sound, or one not measured yet, still needs a line to seek along. */
	waveformDrawn = signal(false);
	/** Played fraction (0..1), for the waveform coloring. */
	progressRatio = computed(() => this.progressPercent() / 100);

	/** Tooltip visibility / position / time. */
	tooltipVisible = computed(() => this.isScrubbing() || this._hoverRatio() !== null);
	tooltipPercent = computed(() => {
		if (this.isScrubbing()) return this.progressPercent();
		const hoverRatio = this._hoverRatio();
		return hoverRatio === null ? 0 : Math.min(100, Math.max(0, hoverRatio * 100));
	});
	tooltipTime = computed(() => {
		if (this.isScrubbing()) return this.displayTime();
		const hoverRatio = this._hoverRatio();
		return hoverRatio === null ? 0 : hoverRatio * this.durationValue();
	});

	/** Human-readable value for assistive technologies, e.g. "0:42 of 3:15". */
	ariaValueText = computed(() => `${this._formatTime(this.displayTime())} of ${this._formatTime(this.durationValue())}`);

	private _toPercent(seconds: number): number {
		const duration = this.durationValue();
		if (duration <= 0) return 0;
		return Math.min(100, Math.max(0, (seconds / duration) * 100));
	}

	private _ratioFromClientX(clientX: number): number {
		const rect = this.trackRef().nativeElement.getBoundingClientRect();
		if (rect.width <= 0) return 0;
		return Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
	}

	private _timeFromClientX(clientX: number): number {
		return this._ratioFromClientX(clientX) * this.durationValue();
	}

	private _formatTime(seconds: number): string {
		if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
		const totalSeconds = Math.floor(seconds);
		const minutes = Math.floor(totalSeconds / 60);
		const remainingSeconds = totalSeconds % 60;
		return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
	}

	private _isInteractive(): boolean {
		return !this.disabled() && this.durationValue() > 0;
	}

	onPointerDown(event: PointerEvent) {
		if (!this._isInteractive()) return;
		this.trackRef().nativeElement.setPointerCapture(event.pointerId);
		const seekTime = this._timeFromClientX(event.clientX);
		this.isScrubbing.set(true);
		this._scrubTime.set(seekTime);
		this.scrubStart.emit();
		this.scrubbing.emit(seekTime);
		event.preventDefault();
	}

	onPointerMove(event: PointerEvent) {
		if (this.isScrubbing()) {
			const seekTime = this._timeFromClientX(event.clientX);
			this._scrubTime.set(seekTime);
			this.scrubbing.emit(seekTime);
			return;
		}
		if (!this._isInteractive()) return;
		this._hoverRatio.set(this._ratioFromClientX(event.clientX));
	}

	onPointerUp(event: PointerEvent) {
		if (!this.isScrubbing()) return;
		const seekTime = this._timeFromClientX(event.clientX);
		this.isScrubbing.set(false);
		this._scrubTime.set(null);
		this.seek.emit(seekTime);
		this.scrubEnd.emit(seekTime);
		if (this.trackRef().nativeElement.hasPointerCapture(event.pointerId)) {
			this.trackRef().nativeElement.releasePointerCapture(event.pointerId);
		}
	}

	onPointerLeave() {
		this._hoverRatio.set(null);
	}

	onKeydown(event: KeyboardEvent) {
		if (!this._isInteractive()) return;

		const stepSeconds = this.keyboardStepSeconds();
		const pageSeconds = this.keyboardPageSeconds();
		let nextTime: number | null = null;

		switch (event.key) {
			case 'ArrowRight':
			case 'ArrowUp':
				nextTime = this.currentTime() + stepSeconds;
				break;
			case 'ArrowLeft':
			case 'ArrowDown':
				nextTime = this.currentTime() - stepSeconds;
				break;
			case 'PageUp':
				nextTime = this.currentTime() + pageSeconds;
				break;
			case 'PageDown':
				nextTime = this.currentTime() - pageSeconds;
				break;
			case 'Home':
				nextTime = 0;
				break;
			case 'End':
				nextTime = this.durationValue();
				break;
			default:
				return;
		}

		const clampedTime = Math.min(this.durationValue(), Math.max(0, nextTime));
		this.seek.emit(clampedTime);
		event.preventDefault();
	}
}
