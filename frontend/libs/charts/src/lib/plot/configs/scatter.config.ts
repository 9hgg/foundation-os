import * as echarts from 'echarts';

import type { BuildOptionParams } from '../plot.models';
import { buildOverlaySeries, buildToolbox, DATA_ZOOM, DEFAULT_PALETTE, GRID } from './_shared';

// ─── Tooltip param type guard ─────────────────────────────────────────────────

interface ScatterTooltipParam {
	seriesName: string;
	value: [number, number | null];
}

function isScatterTooltipParam(p: unknown): p is ScatterTooltipParam {
	return p !== null && typeof p === 'object' && Object.prototype.hasOwnProperty.call(p, 'seriesName');
}

// ─── Scatter chart ────────────────────────────────────────────────────────────

export function buildScatterOption({ series, title, downloadFilename, thresholds, annotations, periods, i18nDownload }: BuildOptionParams): echarts.EChartsOption {
	// Scatter charts are non-time-series: both axes are numeric values.
	const chartSeries: echarts.SeriesOption[] = series.map((s, idx) => {
		const color = s.color ?? DEFAULT_PALETTE[idx % DEFAULT_PALETTE.length];
		const opacity = s.opacity ?? 1;
		return {
			name: s.name,
			type: 'scatter',
			data: s.points.filter(([, y]) => y !== null),
			symbolSize: 6,
			itemStyle: { color, opacity },
		};
	});

	return {
		title: { text: title, left: 'center', textStyle: { color: '#333', fontSize: 14, fontWeight: 'bold' } },
		tooltip: {
			trigger: 'item',
			backgroundColor: 'rgba(50, 50, 50, 0.9)',
			borderColor: '#3b82f6',
			borderWidth: 1,
			textStyle: { color: '#fff' },
			formatter: (rawParams: unknown): string => {
				const paramList = Array.isArray(rawParams) ? rawParams : [rawParams];
				const params = paramList.filter(isScatterTooltipParam);
				if (!params.length) return '';
				return params
					.map((p) => {
						const x = Array.isArray(p.value) ? String(p.value[0] ?? '') : '';
						const y = Array.isArray(p.value) ? String(p.value[1] ?? '') : '';
						return `${p.seriesName}<br/>x: ${x}, y: ${y}`;
					})
					.join('<br/>');
			},
		},
		xAxis: { type: 'value', nameTextStyle: { color: '#666' }, splitLine: { show: false } },
		yAxis: { type: 'value', nameTextStyle: { color: '#666' }, splitLine: { show: true, lineStyle: { color: '#f0f0f0' } } },
		toolbox: buildToolbox(downloadFilename, i18nDownload),
		grid: GRID,
		dataZoom: DATA_ZOOM,
		series: [...chartSeries, ...buildOverlaySeries({ thresholds, annotations, periods })],
	};
}
