import * as echarts from 'echarts';

import type { PlotAnnotation, PlotPeriod, PlotThreshold } from '../plot.models';

// ─── Shared constants ────────────────────────────────────────────────────────

export const DEFAULT_PALETTE = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#06b6d4', '#f97316', '#22c55e', '#e11d48'];
export const HISTOGRAM_BIN_COUNT = 50;

// ─── Mark data type aliases (echarts mark types are complex indexed unions) ──

/** One element of MarkLineComponentOption.data */
type MarkLineItem = NonNullable<echarts.MarkLineComponentOption['data']>[number];

/** One element of MarkPointComponentOption.data */
type MarkPointItem = NonNullable<echarts.MarkPointComponentOption['data']>[number];

/** One element of MarkAreaComponentOption.data (a [start, end] pair) */
type MarkAreaItem = NonNullable<echarts.MarkAreaComponentOption['data']>[number];

// ─── Shared layout ───────────────────────────────────────────────────────────

/** Shared toolbox config for save-as-image. */
export function buildToolbox(downloadFilename: string, i18nDownload: string): echarts.ToolboxComponentOption {
	return {
		feature: {
			dataZoom: {},
			restore: {},
			saveAsImage: { name: downloadFilename, title: i18nDownload, pixelRatio: 2 },
		},
	};
}

/** Shared dataZoom config. */
export const DATA_ZOOM: echarts.DataZoomComponentOption[] = [
	{ type: 'inside', start: 0, end: 100 },
	{ start: 0, end: 100, height: 20, bottom: 20 },
];

/** Shared grid config. */
export const GRID: echarts.GridComponentOption = { top: 60, left: 60, right: 20, bottom: 60 };

// ─── Overlay helpers ─────────────────────────────────────────────────────────

/** Builds a markLine config for horizontal threshold lines. */
export function buildThresholdMarkLines(thresholds: PlotThreshold[]): echarts.MarkLineComponentOption {
	return {
		silent: true,
		data: thresholds.map((t): MarkLineItem => ({
			yAxis: t.value,
			lineStyle: {
				color: t.color ?? '#ff4444',
				type: t.lineStyle ?? 'dashed',
			},
			label: {
				show: !!t.label,
				formatter: t.label ?? '',
			},
		})),
	};
}

/** Builds a markPoint config for point annotations. */
export function buildAnnotationMarkPoints(annotations: PlotAnnotation[]): echarts.MarkPointComponentOption {
	return {
		data: annotations.map((a): MarkPointItem => ({
			coord: [a.x, a.y],
			name: a.label,
			label: { show: true, formatter: a.label },
			itemStyle: { color: a.color ?? '#ff4444' },
		})),
	};
}

/** Builds a markArea config for period bands. */
export function buildPeriodMarkAreas(periods: PlotPeriod[]): echarts.MarkAreaComponentOption {
	return {
		silent: true,
		data: periods.map((p): MarkAreaItem => [
			{ xAxis: p.xStart, name: p.label ?? '', itemStyle: { color: p.color ?? 'rgba(255, 173, 177, 0.4)' } },
			{ xAxis: p.xEnd },
		]),
	};
}

/**
 * Returns a transparent overlay series that carries thresholds, annotations,
 * and period bands as markLine / markPoint / markArea.
 * Returns an empty array when none are needed.
 */
export function buildOverlaySeries(params: { thresholds: PlotThreshold[]; annotations: PlotAnnotation[]; periods: PlotPeriod[] }): echarts.SeriesOption[] {
	const { thresholds, annotations, periods } = params;
	if (!thresholds.length && !annotations.length && !periods.length) return [];

	const overlaySeries: echarts.LineSeriesOption = {
		type: 'line',
		data: [],
		silent: true,
		tooltip: { show: false },
		lineStyle: { width: 0 },
		symbol: 'none',
		itemStyle: { opacity: 0 },
		markLine: thresholds.length ? buildThresholdMarkLines(thresholds) : undefined,
		markPoint: annotations.length ? buildAnnotationMarkPoints(annotations) : undefined,
		markArea: periods.length ? buildPeriodMarkAreas(periods) : undefined,
	};

	return [overlaySeries];
}
