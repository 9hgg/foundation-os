import { audiogramBars, audiogramUrlFor, decodeAudiogram, mayDecodeDirectly } from './audiogram';

/** The same bytes the backend writes: `SPAG`, version, bits per bin, spare, count, rate, duration, peak. */
const buildAudiogram = (levels: number[], { binsPerSecond = 100, duration = levels.length / 100, version = 2, bitsPerBin = 4 } = {}) => {
	const packedLength = Math.ceil(levels.length / 2);
	const buffer = new ArrayBuffer(24 + packedLength);
	const view = new DataView(buffer);
	view.setUint8(0, 0x53);
	view.setUint8(1, 0x50);
	view.setUint8(2, 0x41);
	view.setUint8(3, 0x47);
	view.setUint8(4, version);
	view.setUint8(5, bitsPerBin);
	view.setUint32(8, levels.length, true);
	view.setFloat32(12, binsPerSecond, true);
	view.setFloat32(16, duration, true);
	view.setFloat32(20, 0.5, true);

	const packed = new Uint8Array(buffer, 24);
	for (let index = 0; index < levels.length; index += 2) {
		packed[index >> 1] = (levels[index] << 4) | (levels[index + 1] ?? 0);
	}
	return buffer;
};

describe('decodeAudiogram', () => {
	it('reads two bins out of every byte', () => {
		const audiogram = decodeAudiogram(buildAudiogram([15, 0, 8, 15]));

		expect(audiogram).not.toBeNull();
		// Float32Array, so compared with a tolerance rather than for exact equality.
		expect(Array.from(audiogram!.bins)).toHaveLength(4);
		expect(audiogram!.bins[0]).toBeCloseTo(1, 5);
		expect(audiogram!.bins[1]).toBe(0);
		expect(audiogram!.bins[2]).toBeCloseTo(8 / 15, 5);
		expect(audiogram!.bins[3]).toBeCloseTo(1, 5);
	});

	it('carries the rate and duration the drawing needs', () => {
		const audiogram = decodeAudiogram(buildAudiogram([15, 15], { binsPerSecond: 10, duration: 0.2 }));

		expect(audiogram!.binsPerSecond).toBe(10);
		expect(audiogram!.duration).toBeCloseTo(0.2, 5);
	});

	it('refuses bytes that are not an audiogram', () => {
		// A caller that gets null measures the audio itself, so guessing here would draw nonsense
		// rather than fall back.
		expect(decodeAudiogram(new TextEncoder().encode('this is not an audiogram at all!!').buffer)).toBeNull();
		expect(decodeAudiogram(new ArrayBuffer(4))).toBeNull();
	});

	it('refuses a version it does not know how to read', () => {
		expect(decodeAudiogram(buildAudiogram([15, 0], { version: 3 }))).toBeNull();
	});

	it('refuses version 1, whose bins meant something else', () => {
		// Version 1 stored linear amplitude, which put a spoken file's every bin on 0 or 1 of 15 and
		// drew it as a flat line. Reading those bytes as if they were decibels would draw that same
		// line and look deliberate; refusing them measures the audio instead, or draws nothing.
		expect(decodeAudiogram(buildAudiogram([15, 0], { version: 1 }))).toBeNull();
	});
});

describe('audiogramBars', () => {
	it('always returns the number of bars asked for, whatever the file', () => {
		// A bar is a fixed width on screen; how many bins feed one is the file's business.
		const short = decodeAudiogram(buildAudiogram([15, 0, 15, 0]))!;
		const long = decodeAudiogram(buildAudiogram(Array.from({ length: 4000 }, (_, i) => (i % 2 ? 0 : 15))))!;

		expect(audiogramBars(short, 100, null, null)).toHaveLength(100);
		expect(audiogramBars(long, 100, null, null)).toHaveLength(100);
	});

	it('averages the bins in a bar rather than taking the loudest', () => {
		const audiogram = decodeAudiogram(buildAudiogram([0, 0, 0, 15]))!;

		expect(audiogramBars(audiogram, 1, null, null)[0]).toBeCloseTo(0.25, 5);
	});

	it('does not saturate when a bar covers hundreds of bins', () => {
		// The reason this averages. Speech peaks often enough that every bar of an hour-long file
		// finds a loud bin, so taking the loudest drew a filled rectangle instead of a waveform.
		const levels = Array.from({ length: 20000 }, (_, index) => (index % 50 === 0 ? 15 : 1));
		const audiogram = decodeAudiogram(buildAudiogram(levels))!;

		const bars = audiogramBars(audiogram, 100, null, null);
		expect(Math.max(...bars)).toBeLessThan(0.5);
	});

	it('reads only the window it was given', () => {
		// Silence for a second, then sound: asking for the second second should not show the first.
		const levels = [...Array.from({ length: 100 }, () => 0), ...Array.from({ length: 100 }, () => 15)];
		const audiogram = decodeAudiogram(buildAudiogram(levels))!;

		expect(audiogramBars(audiogram, 4, 0, 1)).toEqual([0, 0, 0, 0]);
		expect(audiogramBars(audiogram, 4, 1, 1)).toEqual([1, 1, 1, 1]);
	});

	it('has an answer for a window past the end', () => {
		const audiogram = decodeAudiogram(buildAudiogram([15, 15]))!;

		expect(audiogramBars(audiogram, 3, 60, 10)).toEqual([0, 0, 0]);
	});
});

describe('audiogramUrlFor', () => {
	it('asks the same address for a different variant', () => {
		// The variant is in the path both ways, so anything that knows how to play a file already
		// knows where its drawing is -- no second input threaded through every caller.
		expect(audiogramUrlFor('https://api.test/p/link-1/default/episode.mp3')).toBe('https://api.test/p/link-1/audiogram');
		expect(audiogramUrlFor('https://api.test/p/link-1/default')).toBe('https://api.test/p/link-1/audiogram');
		expect(audiogramUrlFor('https://api.test/api/files/storage/read/file-1/default/take.mp3')).toBe(
			'https://api.test/api/files/storage/read/file-1/audiogram'
		);
	});

	it('says so when the address is not one it recognises', () => {
		expect(audiogramUrlFor('https://example.test/somewhere/else.mp3')).toBeNull();
		expect(audiogramUrlFor(null)).toBeNull();
		expect(audiogramUrlFor(undefined)).toBeNull();
	});
});

describe('mayDecodeDirectly', () => {
	it('refuses to measure a listener\'s episode ourselves', () => {
		// Downloading it to draw a picture costs them the file and bills the owner for the egress --
		// twice over for a file whose audiogram is missing because there is no sound in it.
		expect(mayDecodeDirectly('https://api.test/p/link-1/default/episode.mp3')).toBe(false);
	});

	it('allows it for a file the person looking already has rights on', () => {
		// The editor working on their own material, where the bytes are theirs either way.
		expect(mayDecodeDirectly('https://api.test/api/files/storage/read/file-1/default/take.mp3')).toBe(true);
	});

	it('has an answer for nothing at all', () => {
		expect(mayDecodeDirectly(null)).toBe(false);
		expect(mayDecodeDirectly(undefined)).toBe(false);
	});
});
