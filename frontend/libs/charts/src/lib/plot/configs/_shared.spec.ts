import { DATA_ZOOM, DEFAULT_PALETTE, GRID, HISTOGRAM_BIN_COUNT, buildAnnotationMarkPoints, buildOverlaySeries, buildPeriodMarkAreas, buildThresholdMarkLines, buildToolbox } from './_shared';

describe('shared plot config', () => {
	it('offers a palette of distinct colours to cycle series through', () => {
		expect(DEFAULT_PALETTE.length).toBeGreaterThan(1);
		expect(new Set(DEFAULT_PALETTE).size).toBe(DEFAULT_PALETTE.length);
		expect(DEFAULT_PALETTE.every((color) => /^#[0-9a-f]{6}$/i.test(color))).toBe(true);
	});

	it('bins a histogram into a fixed number of buckets', () => {
		expect(HISTOGRAM_BIN_COUNT).toBe(50);
	});

	it('leaves room for the title above and the zoom slider below', () => {
		expect(GRID).toMatchObject({ top: 60, bottom: 60 });
	});

	it('offers both an inside and a slider zoom, each covering the whole range', () => {
		expect(DATA_ZOOM).toHaveLength(2);
		expect(DATA_ZOOM[0]).toMatchObject({ type: 'inside', start: 0, end: 100 });
		expect(DATA_ZOOM[1]).toMatchObject({ start: 0, end: 100 });
	});

	describe('buildToolbox', () => {
		it('names the downloaded image after the chart', () => {
			const toolbox = buildToolbox('my-chart', 'Download');

			expect(toolbox.feature?.saveAsImage).toMatchObject({ name: 'my-chart', title: 'Download', pixelRatio: 2 });
		});

		it('offers zoom and restore alongside the download', () => {
			const toolbox = buildToolbox('my-chart', 'Download');

			expect(toolbox.feature?.dataZoom).toBeDefined();
			expect(toolbox.feature?.restore).toBeDefined();
		});
	});

	describe('buildThresholdMarkLines', () => {
		it('places a dashed red line at each threshold by default', () => {
			const markLines = buildThresholdMarkLines([{ value: 10 }]);

			expect(markLines.silent).toBe(true);
			expect(markLines.data?.[0]).toMatchObject({ yAxis: 10, lineStyle: { color: '#ff4444', type: 'dashed' } });
		});

		it("honours a threshold's own colour and line style", () => {
			const markLines = buildThresholdMarkLines([{ value: 10, color: '#00ff00', lineStyle: 'dotted' }]);

			expect(markLines.data?.[0]).toMatchObject({ lineStyle: { color: '#00ff00', type: 'dotted' } });
		});

		it('labels a threshold only when it has something to say', () => {
			expect(buildThresholdMarkLines([{ value: 10, label: 'Limit' }]).data?.[0]).toMatchObject({ label: { show: true, formatter: 'Limit' } });
			expect(buildThresholdMarkLines([{ value: 10 }]).data?.[0]).toMatchObject({ label: { show: false, formatter: '' } });
		});
	});

	describe('buildAnnotationMarkPoints', () => {
		it('pins an annotation at its own coordinates and labels it', () => {
			const markPoints = buildAnnotationMarkPoints([{ x: 1, y: 2, label: 'Here' }]);

			expect(markPoints.data?.[0]).toMatchObject({ coord: [1, 2], name: 'Here', label: { show: true, formatter: 'Here' }, itemStyle: { color: '#ff4444' } });
		});

		it("honours an annotation's own colour", () => {
			const markPoints = buildAnnotationMarkPoints([{ x: 1, y: 2, label: 'Here', color: '#123456' }]);

			expect(markPoints.data?.[0]).toMatchObject({ itemStyle: { color: '#123456' } });
		});
	});

	describe('buildPeriodMarkAreas', () => {
		it('bands a period between its two x values', () => {
			const markAreas = buildPeriodMarkAreas([{ xStart: 1, xEnd: 5, label: 'Outage' }]);

			expect(markAreas.silent).toBe(true);
			const [start, end] = markAreas.data?.[0] as [Record<string, unknown>, Record<string, unknown>];
			expect(start).toMatchObject({ xAxis: 1, name: 'Outage' });
			expect(end).toMatchObject({ xAxis: 5 });
		});

		it('bands an unlabelled period in the default pink', () => {
			const markAreas = buildPeriodMarkAreas([{ xStart: 1, xEnd: 5 }]);
			const [start] = markAreas.data?.[0] as [Record<string, unknown>, Record<string, unknown>];

			expect(start).toMatchObject({ name: '', itemStyle: { color: 'rgba(255, 173, 177, 0.4)' } });
		});
	});

	describe('buildOverlaySeries', () => {
		const noOverlays = { thresholds: [], annotations: [], periods: [] };

		it('adds no series at all when there is nothing to overlay', () => {
			expect(buildOverlaySeries(noOverlays)).toEqual([]);
		});

		it('carries the overlays on one invisible, non-interactive series', () => {
			const [series] = buildOverlaySeries({ ...noOverlays, thresholds: [{ value: 10 }] });

			expect(series).toMatchObject({ type: 'line', data: [], silent: true, symbol: 'none', lineStyle: { width: 0 }, itemStyle: { opacity: 0 } });
			expect(series.tooltip).toMatchObject({ show: false });
		});

		it('attaches only the overlay kinds it was given', () => {
			const [thresholdsOnly] = buildOverlaySeries({ ...noOverlays, thresholds: [{ value: 10 }] });
			expect(thresholdsOnly.markLine).toBeDefined();
			expect(thresholdsOnly.markPoint).toBeUndefined();
			expect(thresholdsOnly.markArea).toBeUndefined();

			const [annotationsOnly] = buildOverlaySeries({ ...noOverlays, annotations: [{ x: 1, y: 2, label: 'Here' }] });
			expect(annotationsOnly.markPoint).toBeDefined();
			expect(annotationsOnly.markLine).toBeUndefined();

			const [periodsOnly] = buildOverlaySeries({ ...noOverlays, periods: [{ xStart: 1, xEnd: 5 }] });
			expect(periodsOnly.markArea).toBeDefined();
			expect(periodsOnly.markLine).toBeUndefined();
		});
	});
});
