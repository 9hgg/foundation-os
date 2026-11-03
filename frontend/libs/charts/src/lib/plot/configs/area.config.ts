import * as echarts from 'echarts';

import type { BuildOptionParams } from '../plot.models';
import { buildOverlaySeries, buildToolbox, DATA_ZOOM, DEFAULT_PALETTE, GRID } from './_shared';

// ─── Tooltip param type guard ─────────────────────────────────────────────────

interface AreaTooltipParam {
	seriesName: string;
	value: [number, number | null];
	axisValue: number | string;
}

function isAreaTooltipParam(p: unknown): p is AreaTooltipParam {
	return p !== null && typeof p === 'object' && Object.prototype.hasOwnProperty.call(p, 'seriesName');
}

// ─── Area chart ───────────────────────────────────────────────────────────────

export function buildAreaOption({ series, title, downloadFilename, thresholds, annotations, periods, i18nDownload, stacked, step, showLegend, yAxisName }: BuildOptionParams): echarts.EChartsOption {
	// Auto-detect: if first x > 1e11 treat as Unix-millisecond timestamps.
	const isTimeSeries = series.some((s) => s.points.length > 0 && (s.points[0]?.[0] ?? 0) > 1e11);

	// Legend lists the main series only — overlay bounds (names ending in " min"/" max") are excluded.
	const legendNames = series.filter((s) => !/ (min|max)$/.test(s.name)).map((s) => s.name);
	const legend: echarts.LegendComponentOption | undefined = showLegend
		? { type: 'scroll', top: 28, data: legendNames, textStyle: { color: '#666' } }
		: undefined;

	const chartSeries: echarts.SeriesOption[] = series.map((s, idx) => {
		const color = s.color ?? DEFAULT_PALETTE[idx % DEFAULT_PALETTE.length];
		const opacity = s.opacity ?? 1;
		return {
			name: s.name,
			type: 'line',
			data: s.points,
			symbol: 'none',
			smooth: !stacked && !step,
			...(step ? { step: 'end' } : {}),
			...(stacked ? { stack: 'total' } : {}),
			areaStyle: { opacity: stacked ? 0.55 : 0.3 },
			lineStyle: { color, width: stacked ? 1 : 2, opacity, type: s.dashed ? 'dashed' : 'solid' },
			itemStyle: { color, opacity },
			sampling: 'lttb',
		};
	});

	return {
		title: { text: title, left: 'center', textStyle: { color: '#333', fontSize: 14, fontWeight: 'bold' } },
		legend,
		tooltip: {
			trigger: 'axis',
			backgroundColor: 'rgba(50, 50, 50, 0.9)',
			borderColor: '#3b82f6',
			borderWidth: 1,
			textStyle: { color: '#fff' },
			formatter: (rawParams: unknown): string => {
				const paramList = Array.isArray(rawParams) ? rawParams : [rawParams];
				const params = paramList.filter(isAreaTooltipParam);
				if (!params.length) return '';
				const first = params[0];
				const xVal = Array.isArray(first.value) ? first.value[0] : first.axisValue;
				const xLabel = isTimeSeries
					? new Date(Number(xVal)).toLocaleString('fr-FR')
					: String(typeof xVal === 'number' ? xVal.toFixed(1) : xVal);
				const lines = params
					.map((p) => `${p.seriesName}: ${Array.isArray(p.value) ? String(p.value[1] ?? '') : String(p.value ?? '')}`)
					.join('<br/>');
				return `${xLabel}<br/>${lines}`;
			},
		},
		xAxis: isTimeSeries
			? {
					type: 'time',
					splitLine: { show: false },
					axisLabel: {
						formatter: (value: unknown): string =>
							new Date(Number(value)).toLocaleDateString('fr-FR', { month: 'short', day: 'numeric', hour: '2-digit' }),
					},
				}
			: { type: 'value', name: 'Temps (s)', nameTextStyle: { color: '#666' }, splitLine: { show: false } },
		yAxis: { type: 'value', name: yAxisName, nameTextStyle: { color: '#666' }, splitLine: { show: true, lineStyle: { color: '#f0f0f0' } } },
		toolbox: buildToolbox(downloadFilename, i18nDownload),
		grid: showLegend ? { ...GRID, top: 84 } : GRID,
		dataZoom: DATA_ZOOM,
		series: [...chartSeries, ...buildOverlaySeries({ thresholds, annotations, periods })],
	};
}
