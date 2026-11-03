import { formatCueTimestamp, parseSubtitleCues } from './subtitle-cues';

const SRT = `1
00:00:00,780 --> 00:00:17,060
Donc, on va faire un petit enregistrement.
2
00:00:18,720 --> 00:00:19,680
Bien moché.
3
00:06:00,610 --> 00:06:02,450
Encore une phrase.`;

describe('parseSubtitleCues', () => {
	it('keeps the timings the prose version throws away', () => {
		const cues = parseSubtitleCues(SRT);

		expect(cues).toHaveLength(3);
		expect(cues[0]).toEqual({ start: 0.78, end: 17.06, text: 'Donc, on va faire un petit enregistrement.' });
		expect(cues[2].start).toBeCloseTo(360.61, 2);
	});

	it('joins a cue split over several lines', () => {
		const cues = parseSubtitleCues('1\n00:00:01,000 --> 00:00:02,000\nfirst line\nsecond line');

		expect(cues[0].text).toBe('first line second line');
	});

	it('reads a timestamp written with a dot, and one with no hour', () => {
		// Both turn up in the wild -- WebVTT drops the hour, and some tools use a dot.
		const cues = parseSubtitleCues('00:01.500 --> 00:02.000\nhello');

		expect(cues[0]).toEqual({ start: 1.5, end: 2, text: 'hello' });
	});

	it('returns nothing rather than throwing on an empty or unparseable transcript', () => {
		expect(parseSubtitleCues('')).toEqual([]);
		expect(parseSubtitleCues('   ')).toEqual([]);
		// A transcript is produced by a model and fetched from storage; showing a listener nothing
		// is better than showing them a crash.
		expect(parseSubtitleCues('not a transcript at all')).toEqual([]);
	});

	it('drops a cue that has a timing but no words', () => {
		expect(parseSubtitleCues('1\n00:00:01,000 --> 00:00:02,000\n\n2\n00:00:03,000 --> 00:00:04,000\nreal')).toHaveLength(1);
	});
});

describe('formatCueTimestamp', () => {
	it('shows an hour only once there is one', () => {
		expect(formatCueTimestamp(64)).toBe('1:04');
		expect(formatCueTimestamp(3723)).toBe('1:02:03');
	});

	it('floors rather than rounding, so a label never names a moment not yet reached', () => {
		expect(formatCueTimestamp(59.9)).toBe('0:59');
		expect(formatCueTimestamp(-1)).toBe('0:00');
	});
});
