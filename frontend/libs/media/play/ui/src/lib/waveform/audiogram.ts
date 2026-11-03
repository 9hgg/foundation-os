/**
 * Reading the shape of a file's sound, as the backend measured it.
 *
 * The alternative is a few kilobytes of bytes rather than the media file itself, which is what a
 * waveform used to be drawn from: fetching an hour-long episode to look at it cost the listener the
 * file twice and the owner the bandwidth, and simply failed once a file was long enough that
 * decoding it filled the tab.
 *
 * See backend/libs/files/processors/audiogram.py -- the two halves have to agree, so the header is
 * described in both places and carries a version.
 */

/** `SPAG`, little-endian, as written by the processor. */
const MAGIC = 0x47415053;
const HEADER_BYTES = 24;
const SUPPORTED_VERSION = 2;

export interface Audiogram {
	/**
	 * One value per bin, 0..1: how loud that moment is in decibels under the file's own loudest one,
	 * over the floor the processor writes at. A height to draw, in other words, not an amplitude --
	 * linear amplitude is what version 1 stored, and it drew every spoken file as a flat line.
	 */
	bins: Float32Array;
	binsPerSecond: number;
	duration: number;
}

/**
 * Decode an audiogram, or return null if these bytes are not one.
 *
 * Null rather than throwing: a caller that cannot read an audiogram falls back to measuring the
 * audio itself, and a file processed before this format existed is the ordinary case rather than an
 * error worth interrupting a page for.
 */
export function decodeAudiogram(buffer: ArrayBuffer): Audiogram | null {
	if (buffer.byteLength < HEADER_BYTES) return null;

	const header = new DataView(buffer);
	if (header.getUint32(0, true) !== MAGIC) return null;
	if (header.getUint8(4) !== SUPPORTED_VERSION) return null;

	const bitsPerBin = header.getUint8(5);
	const binCount = header.getUint32(8, true);
	const binsPerSecond = header.getFloat32(12, true);
	const duration = header.getFloat32(16, true);
	// Only the packing this version writes. A later one changes the version rather than the meaning
	// of these bytes, so anything else is a file we should not guess at.
	if (bitsPerBin !== 4 || binCount === 0) return null;

	const packed = new Uint8Array(buffer, HEADER_BYTES);
	const levels = (1 << bitsPerBin) - 1;
	const bins = new Float32Array(binCount);
	for (let index = 0; index < binCount; index++) {
		const byte = packed[index >> 1];
		if (byte === undefined) break;
		// Two bins to a byte, the first in the high nibble.
		const value = index % 2 === 0 ? byte >> bitsPerBin : byte & levels;
		bins[index] = value / levels;
	}

	return { bins, binsPerSecond, duration };
}

/**
 * Aggregate an audiogram's bins into exactly `barCount` bars, over a window of it.
 *
 * A bar is always the same width on screen whatever the file's length or the zoom, so the bins
 * feeding one are however many fall inside it -- hundreds on an hour-long episode, a handful when
 * zoomed into five seconds.
 *
 * They are averaged, not maxed. Taking the loudest reads well over a handful of bins and collapses
 * over hundreds: speech peaks often enough that every bar of a long file finds a loud bin, so the
 * whole drawing saturates into a filled rectangle. The bins are already RMS -- averaging them is
 * the faithful thing to do, and it is the aggregation that survives being zoomed all the way out.
 */
export function audiogramBars(
	audiogram: Audiogram,
	barCount: number,
	startTime: number | null,
	windowDuration: number | null
): number[] {
	const { bins, binsPerSecond } = audiogram;
	const from = Math.max(0, Math.round((startTime ?? 0) * binsPerSecond));
	const to = windowDuration != null ? Math.min(bins.length, from + Math.round(windowDuration * binsPerSecond)) : bins.length;
	const span = to - from;
	if (span <= 0) return new Array<number>(barCount).fill(0);

	const bars: number[] = [];
	for (let bar = 0; bar < barCount; bar++) {
		const start = from + Math.floor((bar * span) / barCount);
		const end = Math.max(start + 1, from + Math.floor(((bar + 1) * span) / barCount));
		let total = 0;
		let counted = 0;
		for (let index = start; index < end && index < bins.length; index++) {
			total += bins[index];
			counted++;
		}
		bars.push(counted ? total / counted : 0);
	}
	return bars;
}

/**
 * Where a media URL's audiogram lives, or null when the address is not one we recognise.
 *
 * Both ways of addressing a file put the variant in the path -- `/p/<link>/<variant>` for a
 * withdrawable link, `/api/files/storage/read/<id>/<variant>` for a file someone has rights on --
 * so the audiogram is the same address asked for a different variant. Deriving it means every
 * caller that already knows how to play a file also knows how to draw it, without a second input
 * threaded through each of them.
 */
export function audiogramUrlFor(mediaUrl: string | null | undefined): string | null {
	if (!mediaUrl) return null;

	const proxy = /^(.*\/p\/[^/]+)\/[^/]+(?:\/[^/]*)?$/.exec(mediaUrl);
	if (proxy) return `${proxy[1]}/audiogram`;

	const storage = /^(.*\/api\/files\/storage\/read\/[^/]+)\/[^/]+(?:\/[^/]*)?$/.exec(mediaUrl);
	if (storage) return `${storage[1]}/audiogram`;

	return null;
}

/**
 * Whether measuring this address ourselves is an acceptable thing to do.
 *
 * A `/p/` link is a listener's: fetching it costs them the download and bills the owner for the
 * egress, and a proxy fetch is counted. Doing that to draw a picture -- for a file whose audiogram
 * is missing precisely because there is no sound in it -- charges twice for nothing. So the old
 * measure-it-ourselves path is kept only for addresses that belong to whoever is looking, which is
 * the editor working on their own files.
 */
export function mayDecodeDirectly(mediaUrl: string | null | undefined): boolean {
	return !!mediaUrl && !/\/p\/[^/]+\//.test(mediaUrl);
}
