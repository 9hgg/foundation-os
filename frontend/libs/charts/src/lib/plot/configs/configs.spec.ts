import type { EChartsOption } from 'echarts';
import type { BuildOptionParams } from '../plot.models';
import { buildAreaOption } from './area.config';
import { buildBarOption } from './bar.config';
import { buildHeatmapOption } from './heatmap.config';
import { buildHistogramOption } from './histogram.config';
import { buildLineOption } from './line.config';
import { buildPieOption } from './pie.config';
import { buildScatterOption } from './scatter.config';

const baseParams = (overrides: Partial<BuildOptionParams> = {}): BuildOptionParams => ({
	series: [{ name: 'Temperature', points: [[0, 1], [1, 2]] }],
	title: 'My chart',
	downloadFilename: 'my-chart',
	thresholds: [],
	annotations: [],
	periods: [],
	i18nDownload: 'Download',
	...overrides,
});

/** Unix-millisecond x values -- what the builders use to decide an axis is time rather than value. */
const timeSeriesParams = (overrides: Partial<BuildOptionParams> = {}) =>
	baseParams({ series: [{ name: 'Temperature', points: [[1.7e12, 1], [1.7e12 + 1000, 2]] }], ...overrides });

const seriesOf = (option: EChartsOption) => (Array.isArray(option.series) ? option.series : [option.series]);
const axisOf = (option: EChartsOption) => (Array.isArray(option.xAxis) ? option.xAxis[0] : option.xAxis);
const callFormatter = (formatter: unknown, params: unknown) => (formatter as (p: unknown) => string)(params);

describe('buildLineOption', () => {
	it('titles the chart and names the download after it', () => {
		const option = buildLineOption(baseParams());

		expect(option.title).toMatchObject({ text: 'My chart', left: 'center' });
		expect(option.toolbox?.feature?.saveAsImage).toMatchObject({ name: 'my-chart' });
	});

	it('draws one smooth line per series, cycling the palette', () => {
		const option = buildLineOption(baseParams({ series: [{ name: 'A', points: [] }, { name: 'B', points: [] }] }));
		const [first, second] = seriesOf(option);

		expect(first).toMatchObject({ name: 'A', type: 'line', smooth: true, sampling: 'lttb' });
		expect(first.lineStyle.color).not.toBe(second.lineStyle.color);
	});

	it("honours a series' own colour, opacity and dashing", () => {
		const option = buildLineOption(baseParams({ series: [{ name: 'A', points: [], color: '#123456', opacity: 0.5, dashed: true }] }));

		expect(seriesOf(option)[0].lineStyle).toMatchObject({ color: '#123456', opacity: 0.5, type: 'dashed' });
	});

	it('stacks the series and stops smoothing when asked to stack', () => {
		const option = buildLineOption(baseParams({ stacked: true }));

		expect(seriesOf(option)[0]).toMatchObject({ stack: 'total', smooth: false });
	});

	it('steps the series and stops smoothing when asked to step', () => {
		const option = buildLineOption(baseParams({ step: true }));

		expect(seriesOf(option)[0]).toMatchObject({ step: 'end', smooth: false });
	});

	it('leaves the bounds of a series out of the legend', () => {
		const option = buildLineOption(
			baseParams({ showLegend: true, series: [{ name: 'Temperature', points: [] }, { name: 'Temperature min', points: [] }, { name: 'Temperature max', points: [] }] })
		);

		expect(option.legend).toMatchObject({ data: ['Temperature'] });
	});

	it('has no legend unless asked, and drops the grid down to make room when it does', () => {
		expect(buildLineOption(baseParams()).legend).toBeUndefined();
		expect(buildLineOption(baseParams()).grid).toMatchObject({ top: 60 });
		expect(buildLineOption(baseParams({ showLegend: true })).grid).toMatchObject({ top: 84 });
	});

	it('reads large x values as timestamps and switches to a time axis', () => {
		expect(axisOf(buildLineOption(timeSeriesParams()))).toMatchObject({ type: 'time' });
		expect(axisOf(buildLineOption(baseParams()))).toMatchObject({ type: 'value' });
	});

	it('takes a log x axis when asked for one', () => {
		expect(axisOf(buildLineOption(baseParams({ xAxisScale: 'log' })))).toMatchObject({ type: 'log' });
	});

	it('names the axes, defaulting the x axis to seconds', () => {
		expect(axisOf(buildLineOption(baseParams()))).toMatchObject({ name: 'Temps (s)' });
		expect(axisOf(buildLineOption(baseParams({ xAxisName: 'Distance (m)' })))).toMatchObject({ name: 'Distance (m)' });
		expect(buildLineOption(baseParams({ yAxisName: '°C' })).yAxis).toMatchObject({ name: '°C' });
	});

	describe('its tooltip', () => {
		const formatterOf = (params: BuildOptionParams) => buildLineOption(params).tooltip?.formatter;

		it('lists every series at the hovered x, rounded to one decimal', () => {
			const text = callFormatter(formatterOf(baseParams()), [
				{ seriesName: 'A', value: [1.234, 10], axisValue: 1.234 },
				{ seriesName: 'B', value: [1.234, 20], axisValue: 1.234 },
			]);

			expect(text).toBe('1.2<br/>A: 10<br/>B: 20');
		});

		it('takes a single hovered point rather than a list', () => {
			expect(callFormatter(formatterOf(baseParams()), { seriesName: 'A', value: [2, 10], axisValue: 2 })).toBe('2.0<br/>A: 10');
		});

		it('says nothing when nothing recognisable is hovered', () => {
			expect(callFormatter(formatterOf(baseParams()), [null])).toBe('');
		});

		it('shows a date rather than a number on a time series', () => {
			const text = callFormatter(formatterOf(timeSeriesParams()), [{ seriesName: 'A', value: [1.7e12, 10], axisValue: 1.7e12 }]);

			expect(text).toContain(new Date(1.7e12).toLocaleString('fr-FR'));
		});

		it('leaves a gap for a missing value instead of printing null', () => {
			expect(callFormatter(formatterOf(baseParams()), [{ seriesName: 'A', value: [1, null], axisValue: 1 }])).toBe('1.0<br/>A: ');
		});
	});

	it('formats the time axis labels as day and hour', () => {
		const formatter = axisOf(buildLineOption(timeSeriesParams()))?.axisLabel?.formatter;

		expect(callFormatter(formatter, 1.7e12)).toBe(new Date(1.7e12).toLocaleDateString('fr-FR', { month: 'short', day: 'numeric', hour: '2-digit' }));
	});

	it('appends the overlay series carrying thresholds, annotations and periods', () => {
		const option = buildLineOption(baseParams({ thresholds: [{ value: 5 }], annotations: [{ x: 1, y: 2, label: 'Here' }], periods: [{ xStart: 0, xEnd: 1 }] }));
		const overlay = seriesOf(option).at(-1);

		expect(seriesOf(option)).toHaveLength(2);
		expect(overlay).toMatchObject({ silent: true });
		expect(overlay.markLine).toBeDefined();
		expect(overlay.markPoint).toBeDefined();
		expect(overlay.markArea).toBeDefined();
	});
});

describe('buildAreaOption', () => {
	it('fills under each line', () => {
		expect(seriesOf(buildAreaOption(baseParams()))[0]).toMatchObject({ type: 'line', areaStyle: { opacity: 0.3 } });
	});

	it('fills more solidly and thins the stroke when stacked', () => {
		const [series] = seriesOf(buildAreaOption(baseParams({ stacked: true })));

		expect(series).toMatchObject({ stack: 'total', areaStyle: { opacity: 0.55 } });
		expect(series.lineStyle.width).toBe(1);
	});

	it('steps the series when asked to', () => {
		expect(seriesOf(buildAreaOption(baseParams({ step: true })))[0]).toMatchObject({ step: 'end', smooth: false });
	});

	it('reads large x values as timestamps and switches to a time axis', () => {
		expect(axisOf(buildAreaOption(timeSeriesParams()))).toMatchObject({ type: 'time' });
		expect(axisOf(buildAreaOption(baseParams()))).toMatchObject({ type: 'value' });
	});

	it('leaves the bounds of a series out of the legend', () => {
		const option = buildAreaOption(baseParams({ showLegend: true, series: [{ name: 'A', points: [] }, { name: 'A max', points: [] }] }));

		expect(option.legend).toMatchObject({ data: ['A'] });
	});

	it('lists every series at the hovered x', () => {
		const text = callFormatter(buildAreaOption(baseParams()).tooltip?.formatter, [{ seriesName: 'A', value: [1.5, 10], axisValue: 1.5 }]);

		expect(text).toBe('1.5<br/>A: 10');
	});

	it('says nothing when nothing recognisable is hovered', () => {
		expect(callFormatter(buildAreaOption(baseParams()).tooltip?.formatter, [null])).toBe('');
	});

	it('appends the overlay series', () => {
		const option = buildAreaOption(baseParams({ thresholds: [{ value: 5 }] }));

		expect(seriesOf(option)).toHaveLength(2);
	});
});

describe('buildScatterOption', () => {
	it('draws points rather than lines', () => {
		expect(seriesOf(buildScatterOption(baseParams()))[0]).toMatchObject({ type: 'scatter', symbolSize: 6 });
	});

	it('drops the points with no y value -- a scatter has nothing to interpolate', () => {
		const option = buildScatterOption(baseParams({ series: [{ name: 'A', points: [[0, 1], [1, null], [2, 3]] }] }));

		expect(seriesOf(option)[0].data).toEqual([[0, 1], [2, 3]]);
	});

	it('keeps both axes numeric -- a scatter is never a time series', () => {
		expect(axisOf(buildScatterOption(timeSeriesParams()))).toMatchObject({ type: 'value' });
	});

	it('names the hovered series and both of its coordinates', () => {
		const text = callFormatter(buildScatterOption(baseParams()).tooltip?.formatter, [{ seriesName: 'A', value: [1, 2] }]);

		expect(text).toBe('A<br/>x: 1, y: 2');
	});

	it('says nothing when nothing recognisable is hovered', () => {
		expect(callFormatter(buildScatterOption(baseParams()).tooltip?.formatter, [null])).toBe('');
	});
});

describe('buildBarOption', () => {
	it('draws one bar series per series', () => {
		expect(seriesOf(buildBarOption(baseParams()))[0]).toMatchObject({ name: 'Temperature', type: 'bar' });
	});

	it('reads large x values as timestamps and switches to a time axis', () => {
		expect(axisOf(buildBarOption(timeSeriesParams()))).toMatchObject({ type: 'time' });
		expect(axisOf(buildBarOption(baseParams()))).toMatchObject({ type: 'value' });
	});

	it('lists every series at the hovered x', () => {
		const text = callFormatter(buildBarOption(baseParams()).tooltip?.formatter, [{ seriesName: 'A', value: [1.5, 10], axisValue: 1.5 }]);

		expect(text).toBe('1.5<br/>A: 10');
	});

	it('says nothing when nothing recognisable is hovered', () => {
		expect(callFormatter(buildBarOption(baseParams()).tooltip?.formatter, [null])).toBe('');
	});
});

describe('buildHistogramOption', () => {
	describe('given bins already computed by the backend', () => {
		const histogramBins = [{ lower: 0, upper: 1, value: 0.5 }, { lower: 1, upper: 2, value: 0.25 }];

		it('plots the bin values as they are', () => {
			const option = buildHistogramOption(baseParams({ histogramBins }));

			expect(seriesOf(option)[0]).toMatchObject({ name: 'Densité', type: 'bar', data: [0.5, 0.25] });
		});

		it('labels each bar with the centre of its bin', () => {
			const option = buildHistogramOption(baseParams({ histogramBins }));

			expect(axisOf(option)).toMatchObject({ type: 'category', data: ['5.000e-1', '1.500e+0'] });
		});

		it('marks the chart and its download as a histogram', () => {
			const option = buildHistogramOption(baseParams({ histogramBins }));

			expect(option.title).toMatchObject({ text: 'My chart — Histogramme' });
			expect(option.toolbox?.feature?.saveAsImage).toMatchObject({ name: 'my-chart_histogramme' });
		});

		it('names itself Histogramme when the chart has no title', () => {
			expect(buildHistogramOption(baseParams({ histogramBins, title: '' })).title).toMatchObject({ text: 'Histogramme' });
		});

		it('reports the bin bounds and its density on hover', () => {
			const text = callFormatter(buildHistogramOption(baseParams({ histogramBins })).tooltip?.formatter, [{ dataIndex: 1 }]);

			expect(text).toBe('[1.0000e+0 ; 2.0000e+0]<br/>Densité: 2.5000e-1');
		});

		it('says nothing when nothing recognisable is hovered', () => {
			expect(callFormatter(buildHistogramOption(baseParams({ histogramBins })).tooltip?.formatter, [{}])).toBe('');
		});
	});

	describe('given raw series to bin itself', () => {
		const spread = baseParams({ series: [{ name: 'A', points: [[0, 0], [1, 5], [2, 10]] }] });

		it('bins the y values of each series into fifty buckets', () => {
			const [series] = seriesOf(buildHistogramOption(spread));

			expect(series).toMatchObject({ name: 'A', type: 'bar' });
			expect(series.data).toHaveLength(50);
			expect(series.data.reduce((total: number, count: number) => total + count, 0)).toBe(3);
		});

		it('puts the largest value in the last bucket rather than past the end', () => {
			const [series] = seriesOf(buildHistogramOption(spread));

			expect(series.data.at(-1)).toBe(1);
		});

		it('ignores the points with no y value', () => {
			const [series] = seriesOf(buildHistogramOption(baseParams({ series: [{ name: 'A', points: [[0, 0], [1, null], [2, 10]] }] })));

			expect(series.data.reduce((total: number, count: number) => total + count, 0)).toBe(2);
		});

		it('gives up on a series with no values at all', () => {
			expect(buildHistogramOption(baseParams({ series: [{ name: 'A', points: [] }] }))).toEqual({});
		});

		it('gives up when every value is the same -- there is no range to bin', () => {
			expect(buildHistogramOption(baseParams({ series: [{ name: 'A', points: [[0, 5], [1, 5]] }] }))).toEqual({});
		});

		it('reports the bounds of the hovered bucket and how many points fell in it', () => {
			const text = callFormatter(buildHistogramOption(spread).tooltip?.formatter, [{ seriesName: 'A', value: 1, dataIndex: 0 }]);

			expect(text).toBe('[0.000 ; 0.200]<br/>A: 1 points');
		});

		it('says nothing when nothing recognisable is hovered', () => {
			expect(callFormatter(buildHistogramOption(spread).tooltip?.formatter, [null])).toBe('');
		});
	});
});

describe('buildPieOption', () => {
	const pieSeries = [{ name: 'Yes', value: 3 }, { name: 'No', value: 1, color: '#ff0000' }];

	it('draws a donut of the given slices', () => {
		const [series] = seriesOf(buildPieOption(baseParams({ pieSeries })));

		expect(series).toMatchObject({ type: 'pie', avoidLabelOverlap: true });
		expect(series.radius[0]).not.toBe('0%');
		expect(series.data).toEqual([
			{ name: 'Yes', value: 3, itemStyle: undefined },
			{ name: 'No', value: 1, itemStyle: { color: '#ff0000' } },
		]);
	});

	it('names the series after the chart, and Distribution when it has no title', () => {
		expect(seriesOf(buildPieOption(baseParams({ pieSeries })))[0].name).toBe('My chart');
		expect(seriesOf(buildPieOption(baseParams({ pieSeries, title: '' })))[0].name).toBe('Distribution');
	});

	it('says so on the chart when every slice is empty', () => {
		const option = buildPieOption(baseParams({ pieSeries: [{ name: 'Yes', value: 0 }], i18nNoData: 'Nothing yet' }));

		expect(option.graphic).toMatchObject([{ type: 'text', style: { text: 'Nothing yet' } }]);
	});

	it('says so on the chart when there are no slices at all', () => {
		expect(buildPieOption(baseParams()).graphic).toMatchObject([{ style: { text: 'No data' } }]);
		expect(seriesOf(buildPieOption(baseParams()))[0].data).toEqual([]);
	});

	it('says nothing extra once a slice has a value', () => {
		expect(buildPieOption(baseParams({ pieSeries })).graphic).toBeUndefined();
	});
});

describe('buildHeatmapOption', () => {
	const heatmapData = {
		xLabels: ['a', 'b'],
		yLabels: ['x', 'y'],
		data: [[0, 0, 3], [1, 1, 7]] as [number, number, number][],
		xAxisName: 'Predicted',
		yAxisName: 'Actual',
	};

	it('gives up without any heatmap data', () => {
		expect(buildHeatmapOption(baseParams())).toEqual({});
	});

	it('plots the cells against the given labels', () => {
		const option = buildHeatmapOption(baseParams({ heatmapData }));

		expect(seriesOf(option)[0]).toMatchObject({ type: 'heatmap', data: heatmapData.data });
		expect(axisOf(option)).toMatchObject({ type: 'category', data: ['a', 'b'], name: 'Predicted' });
		expect(option.yAxis).toMatchObject({ type: 'category', data: ['x', 'y'], name: 'Actual' });
	});

	it('scales the colours to the largest cell', () => {
		expect(buildHeatmapOption(baseParams({ heatmapData })).visualMap).toMatchObject({ min: 0, max: 7 });
	});

	it('keeps a usable colour range for an all-zero matrix', () => {
		const option = buildHeatmapOption(baseParams({ heatmapData: { ...heatmapData, data: [[0, 0, 0]] } }));

		expect(option.visualMap).toMatchObject({ max: 1 });
	});

	it('rotates the labels and widens the margins once the matrix gets big', () => {
		const wide = { ...heatmapData, xLabels: ['a', 'b', 'c', 'd', 'e', 'f'], yLabels: ['a', 'b', 'c', 'd', 'e', 'f'] };

		expect(axisOf(buildHeatmapOption(baseParams({ heatmapData: wide })))?.axisLabel).toMatchObject({ rotate: 35 });
		expect(buildHeatmapOption(baseParams({ heatmapData: wide })).grid).toMatchObject({ left: '22%' });
		expect(axisOf(buildHeatmapOption(baseParams({ heatmapData })))?.axisLabel).toMatchObject({ rotate: 0 });
		expect(buildHeatmapOption(baseParams({ heatmapData })).grid).toMatchObject({ left: '18%' });
	});

	it('leaves less room at the top when there is no title', () => {
		expect(buildHeatmapOption(baseParams({ heatmapData, title: '' })).grid).toMatchObject({ top: '6%' });
		expect(buildHeatmapOption(baseParams({ heatmapData })).grid).toMatchObject({ top: '12%' });
	});

	it('reads the hovered cell back as actual to predicted, with its count', () => {
		const text = callFormatter(buildHeatmapOption(baseParams({ heatmapData })).tooltip?.formatter, [{ value: [1, 0, 7] }]);

		expect(text).toBe('<b>x</b> → <b>b</b><br/>Count: 7');
	});

	it('marks an out-of-range cell rather than showing undefined', () => {
		const text = callFormatter(buildHeatmapOption(baseParams({ heatmapData })).tooltip?.formatter, [{ value: [9, 9, 1] }]);

		expect(text).toBe('<b>?</b> → <b>?</b><br/>Count: 1');
	});

	it('says nothing when nothing recognisable is hovered', () => {
		expect(callFormatter(buildHeatmapOption(baseParams({ heatmapData })).tooltip?.formatter, [null])).toBe('');
	});

	it('writes the count inside each cell, and leaves an empty one blank', () => {
		const formatter = seriesOf(buildHeatmapOption(baseParams({ heatmapData })))[0].label.formatter;

		expect(callFormatter(formatter, { value: [0, 0, 3] })).toBe('3');
		expect(callFormatter(formatter, { value: [0, 0, 0] })).toBe('');
		expect(callFormatter(formatter, null)).toBe('');
	});
});
