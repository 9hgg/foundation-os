import * as echarts from 'echarts';

import type { BuildOptionParams } from '../plot.models';
import { buildToolbox, DATA_ZOOM, DEFAULT_PALETTE, HISTOGRAM_BIN_COUNT } from './_shared';

// ─── Histogram ────────────────────────────────────────────────────────────────

export function buildHistogramOption({ series, histogramBins, title, downloadFilename, i18nDownload }: BuildOptionParams): echarts.EChartsOption {
	if (histogramBins?.length) {
		const labels = histogramBins.map((bin) => ((bin.lower + bin.upper) / 2).toExponential(3));
		return {
			title: { text: title ? `${title} — Histogramme` : 'Histogramme', left: 'center', textStyle: { color: '#333', fontSize: 14, fontWeight: 'bold' } },
			tooltip: {
				trigger: 'axis',
				formatter: (rawParams: unknown): string => {
					const params = Array.isArray(rawParams) ? rawParams : [rawParams];
					const index = (params[0] as { dataIndex?: number } | undefined)?.dataIndex;
					if (index === undefined) return '';
					const bin = histogramBins[index];
					return `[${bin.lower.toExponential(4)} ; ${bin.upper.toExponential(4)}]<br/>Densité: ${bin.value.toExponential(4)}`;
				},
			},
			xAxis: { type: 'category', data: labels },
			yAxis: { type: 'value', name: 'Densité' },
			toolbox: buildToolbox(`${downloadFilename}_histogramme`, i18nDownload),
			grid: { top: 60, left: 70, right: 20, bottom: 60 },
			dataZoom: DATA_ZOOM,
			series: [{ name: 'Densité', type: 'bar', data: histogramBins.map((bin) => bin.value), itemStyle: { color: DEFAULT_PALETTE[0], opacity: 0.8 }, barWidth: '90%' }],
		};
	}
	const allValues = series.flatMap((s) => s.points.map(([, y]) => y).filter((v): v is number => v !== null));
	if (!allValues.length) return {};

	const globalMin = Math.min(...allValues);
	const globalMax = Math.max(...allValues);
	if (globalMin === globalMax) return {};

	const binWidth = (globalMax - globalMin) / HISTOGRAM_BIN_COUNT;
	const binLabels = Array.from({ length: HISTOGRAM_BIN_COUNT }, (_, i) => (globalMin + (i + 0.5) * binWidth).toFixed(3));

	const chartSeries: echarts.SeriesOption[] = series.map((s, idx) => {
		const color = s.color ?? DEFAULT_PALETTE[idx % DEFAULT_PALETTE.length];
		const opacity = s.opacity ?? 0.8;
		const bins = new Array<number>(HISTOGRAM_BIN_COUNT).fill(0);
		s.points.forEach(([, y]) => {
			if (y !== null) {
				bins[Math.min(Math.floor((y - globalMin) / binWidth), HISTOGRAM_BIN_COUNT - 1)]++;
			}
		});
		return { name: s.name, type: 'bar', data: bins, itemStyle: { color, opacity }, barWidth: '90%' };
	});

	const titleText = title ? `${title} — Histogramme` : 'Histogramme';

	return {
		title: { text: titleText, left: 'center', textStyle: { color: '#333', fontSize: 14, fontWeight: 'bold' } },
		tooltip: {
			trigger: 'axis',
			formatter: (rawParams: unknown): string => {
				const paramList = Array.isArray(rawParams) ? rawParams : [rawParams];
				const params = paramList.filter(
					(p): p is { seriesName: string; value: number; dataIndex: number } =>
						p !== null && typeof p === 'object' && Object.prototype.hasOwnProperty.call(p, 'dataIndex'),
				);
				if (!params.length) return '';
				const binIndex = params[0].dataIndex;
				const from = (globalMin + binIndex * binWidth).toFixed(3);
				const to = (globalMin + (binIndex + 1) * binWidth).toFixed(3);
				const lines = params.map((p) => `${p.seriesName}: ${p.value} points`).join('<br/>');
				return `[${from} ; ${to}]<br/>${lines}`;
			},
		},
		xAxis: { type: 'category', data: binLabels, nameTextStyle: { color: '#666' }, axisLabel: { interval: Math.floor(HISTOGRAM_BIN_COUNT / 5) } },
		yAxis: { type: 'value', nameTextStyle: { color: '#666' } },
		toolbox: buildToolbox(`${downloadFilename}_histogramme`, i18nDownload),
		grid: { top: 60, left: 70, right: 20, bottom: 60 },
		dataZoom: DATA_ZOOM,
		series: chartSeries,
	};
}
