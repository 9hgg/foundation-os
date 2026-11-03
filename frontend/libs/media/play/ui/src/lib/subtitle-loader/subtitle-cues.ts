/** One line of an SRT, with the moment it belongs to. */
export interface SubtitleCue {
	/** Seconds from the start of the media. */
	start: number;
	end: number;
	text: string;
}

/** `00:01:02,500` and `00:01:02.500` both appear in the wild; WebVTT drops the hour on short files. */
const TIMESTAMP = /(?:(\d+):)?(\d{1,2}):(\d{2})[,.](\d{1,3})/;
const CUE_RANGE = new RegExp(`^\\s*${TIMESTAMP.source}\\s*-->\\s*${TIMESTAMP.source}`);

function toSeconds(hours: string | undefined, minutes: string, seconds: string, milliseconds: string): number {
	return Number(hours ?? 0) * 3600 + Number(minutes) * 60 + Number(seconds) + Number(milliseconds.padEnd(3, '0')) / 1000;
}

/**
 * The cues of an SRT, in order, with their timings kept.
 *
 * Deliberately forgiving: transcripts are produced by a model and served from storage, so a stray
 * blank line or a missing cue number is not a reason to show a listener nothing. Anything that does
 * not parse as a timing line is treated as the text of the cue it follows.
 */
export function parseSubtitleCues(subtitle: string): SubtitleCue[] {
	if (!subtitle.trim()) return [];

	const cues: SubtitleCue[] = [];
	let current: SubtitleCue | null = null;

	for (const rawLine of subtitle.split(/\r?\n/)) {
		const line = rawLine.trim();
		const range = CUE_RANGE.exec(line);

		if (range) {
			const [, startHours, startMinutes, startSeconds, startMillis, endHours, endMinutes, endSeconds, endMillis] = range;
			current = {
				start: toSeconds(startHours, startMinutes, startSeconds, startMillis),
				end: toSeconds(endHours, endMinutes, endSeconds, endMillis),
				text: '',
			};
			cues.push(current);
			continue;
		}

		// A bare number between cues is the cue counter, which carries nothing a reader wants.
		if (!current || !line || /^\d+$/.test(line)) continue;
		current.text = current.text ? `${current.text} ${line}` : line;
	}

	return cues.filter((cue) => cue.text);
}

/** `1:04`, or `1:02:03` once there is an hour to show. */
export function formatCueTimestamp(seconds: number): string {
	const whole = Math.max(0, Math.floor(seconds));
	const hours = Math.floor(whole / 3600);
	const minutes = Math.floor((whole % 3600) / 60);
	const remainder = whole % 60;
	const padded = `${String(minutes).padStart(hours ? 2 : 1, '0')}:${String(remainder).padStart(2, '0')}`;
	return hours ? `${hours}:${padded}` : padded;
}
