import { TestBed } from '@angular/core/testing';
import { WaveformComponent } from './waveform.component';

function buildAudioBuffer(sampleRate: number, samples: number[]): AudioBuffer {
	return {
		sampleRate,
		length: samples.length,
		getChannelData: () => Float32Array.from(samples),
	} as unknown as AudioBuffer;
}

describe('WaveformComponent', () => {
	const build = () => {
		TestBed.configureTestingModule({ imports: [WaveformComponent] });
		return TestBed.createComponent(WaveformComponent);
	};

	let decodeAudioData: ReturnType<typeof vi.fn>;
	let fetchMock: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		decodeAudioData = vi.fn();
		class FakeOfflineAudioContext {
			decodeAudioData(buffer: ArrayBuffer) {
				return decodeAudioData(buffer);
			}
		}
		vi.stubGlobal('OfflineAudioContext', FakeOfflineAudioContext);
		fetchMock = vi.fn();
		vi.stubGlobal('fetch', fetchMock);
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('has no bars, and fetches nothing, without an audioUrl', () => {
		const fixture = build();
		fixture.detectChanges();
		expect(fixture.componentInstance.bars()).toEqual([]);
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it('clears the bars and resets the cache when the url is cleared', async () => {
		const buffer = buildAudioBuffer(1000, new Array(2000).fill(0.5));
		fetchMock.mockResolvedValue({ ok: true, arrayBuffer: () => Promise.resolve(new ArrayBuffer(4)) });
		decodeAudioData.mockResolvedValue(buffer);

		const fixture = build();
		fixture.componentRef.setInput('audioUrl', 'https://example.test/audio.mp3');
		fixture.detectChanges();
		await flush();
		fixture.detectChanges();

		expect(fixture.componentInstance.bars().length).toBeGreaterThan(0);

		fixture.componentRef.setInput('audioUrl', null);
		fixture.detectChanges();

		expect(fixture.componentInstance.bars()).toEqual([]);
	});

	describe('fetching and decoding', () => {
		it('fetches, decodes and extracts peaks into BAR_COUNT bars', async () => {
			const buffer = buildAudioBuffer(1000, new Array(2000).fill(0.5));
			fetchMock.mockResolvedValue({ ok: true, arrayBuffer: () => Promise.resolve(new ArrayBuffer(4)) });
			decodeAudioData.mockResolvedValue(buffer);

			const fixture = build();
			fixture.componentRef.setInput('audioUrl', 'https://example.test/audio.mp3');
			fixture.detectChanges();
			await flush();
			fixture.detectChanges();

			expect(fetchMock).toHaveBeenCalledWith('https://example.test/audio.mp3');
			expect(fixture.componentInstance.bars()).toHaveLength(fixture.componentInstance.BAR_COUNT);
			expect(fixture.componentInstance.bars().every((bar) => bar > 0)).toBe(true);
		});

		it('gives up quietly when the fetch responds with a non-ok status', async () => {
			fetchMock.mockResolvedValue({ ok: false, status: 500, arrayBuffer: () => Promise.resolve(new ArrayBuffer(4)) });

			const fixture = build();
			fixture.componentRef.setInput('audioUrl', 'https://example.test/audio.mp3');
			fixture.detectChanges();
			await flush();
			fixture.detectChanges();

			expect(decodeAudioData).not.toHaveBeenCalled();
			expect(fixture.componentInstance.bars()).toEqual([]);
		});

		it('swallows a network error without throwing', async () => {
			fetchMock.mockRejectedValue(new Error('offline'));

			const fixture = build();
			fixture.componentRef.setInput('audioUrl', 'https://example.test/audio.mp3');
			expect(() => fixture.detectChanges()).not.toThrow();
			await flush();
			expect(fixture.componentInstance.bars()).toEqual([]);
		});

		it('discards a stale response when the url changes before the fetch resolves', async () => {
			let resolveFirst!: (value: any) => void;
			fetchMock.mockImplementationOnce(() => new Promise((resolve) => (resolveFirst = resolve)));
			fetchMock.mockResolvedValueOnce({ ok: true, arrayBuffer: () => Promise.resolve(new ArrayBuffer(4)) });
			decodeAudioData.mockResolvedValue(buildAudioBuffer(1000, new Array(2000).fill(0.5)));

			const fixture = build();
			fixture.componentRef.setInput('audioUrl', 'https://example.test/first.mp3');
			fixture.detectChanges();

			fixture.componentRef.setInput('audioUrl', 'https://example.test/second.mp3');
			fixture.detectChanges();

			// second fetch call (for "second.mp3") already resolved via mockResolvedValueOnce ordering below
			resolveFirst({ ok: true, arrayBuffer: () => Promise.resolve(new ArrayBuffer(4)) });
			await flush();
			fixture.detectChanges();

			expect(decodeAudioData).toHaveBeenCalledTimes(1);
		});

		it('re-extracts cheaply from the cached buffer when only the window changes', async () => {
			const buffer = buildAudioBuffer(1000, new Array(4000).fill(0.5));
			fetchMock.mockResolvedValue({ ok: true, arrayBuffer: () => Promise.resolve(new ArrayBuffer(4)) });
			decodeAudioData.mockResolvedValue(buffer);

			const fixture = build();
			fixture.componentRef.setInput('audioUrl', 'https://example.test/audio.mp3');
			fixture.detectChanges();
			await flush();
			fixture.detectChanges();

			expect(fetchMock).toHaveBeenCalledTimes(1);

			fixture.componentRef.setInput('startTime', 1);
			fixture.detectChanges();

			expect(fetchMock).toHaveBeenCalledTimes(1);
			expect(decodeAudioData).toHaveBeenCalledTimes(1);
			expect(fixture.componentInstance.bars()).toHaveLength(fixture.componentInstance.BAR_COUNT);
		});
	});

	describe('playedBarCount', () => {
		it('is zero with no progress', () => {
			const fixture = build();
			fixture.detectChanges();
			expect(fixture.componentInstance.playedBarCount()).toBe(0);
		});

		it('rounds the ratio applied to the number of bars', async () => {
			const buffer = buildAudioBuffer(1000, new Array(2000).fill(0.5));
			fetchMock.mockResolvedValue({ ok: true, arrayBuffer: () => Promise.resolve(new ArrayBuffer(4)) });
			decodeAudioData.mockResolvedValue(buffer);

			const fixture = build();
			fixture.componentRef.setInput('audioUrl', 'https://example.test/audio.mp3');
			fixture.componentRef.setInput('progressRatio', 0.5);
			fixture.detectChanges();
			await flush();
			fixture.detectChanges();

			expect(fixture.componentInstance.playedBarCount()).toBe(Math.round(0.5 * fixture.componentInstance.BAR_COUNT));
		});

		it('clamps an out-of-range progressRatio to [0, 1]', async () => {
			const buffer = buildAudioBuffer(1000, new Array(2000).fill(0.5));
			fetchMock.mockResolvedValue({ ok: true, arrayBuffer: () => Promise.resolve(new ArrayBuffer(4)) });
			decodeAudioData.mockResolvedValue(buffer);

			const fixture = build();
			fixture.componentRef.setInput('audioUrl', 'https://example.test/audio.mp3');
			fixture.componentRef.setInput('progressRatio', 5);
			fixture.detectChanges();
			await flush();
			fixture.detectChanges();

			expect(fixture.componentInstance.playedBarCount()).toBe(fixture.componentInstance.BAR_COUNT);
		});
	});

	describe('how many bars', () => {
		const barsFor = (duration: number | null) => {
			const fixture = build();
			if (duration !== null) fixture.componentRef.setInput('duration', duration);
			fixture.detectChanges();
			return fixture.componentInstance.barCount();
		};

		it('draws its usual hundred when nothing says how long the audio is', () => {
			// A seek bar names no duration, and a hundred bars across a player bar is plenty.
			expect(barsFor(null)).toBe(100);
		});

		it('draws ten a second for a caller that does say', () => {
			// The bug: a mix timeline is 100 pixels to the second, so a 458.6s block is 45,860
			// pixels wide, and a hundred bars across it is 458 pixels each -- three slabs and two
			// gaps. Ten a second is ten pixels a bar, and is the rate the file was measured at.
			expect(barsFor(458.6)).toBe(4586);
		});

		it('never goes below the hundred it drew before', () => {
			// Ten a second would give a three-second block thirty bars, which is coarser than what
			// it already had. The rate raises the count; it must not lower it.
			expect(barsFor(3)).toBe(100);
		});

		it('stops growing rather than asking for a hundred thousand bars', () => {
			// Three hours at ten a second. Unbounded, this is where the drawing costs more than it
			// tells anyone.
			expect(barsFor(3 * 3600)).toBe(5000);
		});
	});

	describe('peak extraction edge cases', () => {
		it('pads with the minimum bar height when the requested window is out of range', async () => {
			const buffer = buildAudioBuffer(1000, new Array(500).fill(0.5));
			fetchMock.mockResolvedValue({ ok: true, arrayBuffer: () => Promise.resolve(new ArrayBuffer(4)) });
			decodeAudioData.mockResolvedValue(buffer);

			const fixture = build();
			fixture.componentRef.setInput('audioUrl', 'https://example.test/audio.mp3');
			// starts past the end of the (short) buffer
			fixture.componentRef.setInput('startTime', 10);
			fixture.detectChanges();
			await flush();
			fixture.detectChanges();

			expect(fixture.componentInstance.bars().every((bar) => bar === fixture.componentInstance.MIN_BAR_HEIGHT)).toBe(true);
		});

		it('renders bars into the template once populated', async () => {
			const buffer = buildAudioBuffer(1000, new Array(2000).fill(0.5));
			fetchMock.mockResolvedValue({ ok: true, arrayBuffer: () => Promise.resolve(new ArrayBuffer(4)) });
			decodeAudioData.mockResolvedValue(buffer);

			const fixture = build();
			fixture.componentRef.setInput('audioUrl', 'https://example.test/audio.mp3');
			fixture.detectChanges();
			await flush();
			fixture.detectChanges();

			const rects = (fixture.nativeElement as HTMLElement).querySelectorAll('rect');
			expect(rects.length).toBe(fixture.componentInstance.BAR_COUNT);
		});
	});
});

async function flush() {
	await Promise.resolve();
	await Promise.resolve();
	await Promise.resolve();
	await Promise.resolve();
}
