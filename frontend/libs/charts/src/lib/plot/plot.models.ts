import type * as echarts from 'echarts';

/** A single [x, y] data point. */
export type PlotPoint = [number, number | null];

/** A named, optionally coloured series of data points. */
export interface PlotSeries {
	name: string;
	color?: string;
	/** Visual opacity of the line/bar (0–1). Useful for secondary series such as min/max bounds. */
	opacity?: number;
	points: PlotPoint[];
}

/** A histogram bin already computed by a backend or analytics engine. */
export interface PlotHistogramBin {
	lower: number;
	upper: number;
	value: number;
}

/** Optional numeric-axis presentation for line charts. */
export type PlotAxisScale = 'linear' | 'log';

/** Supported visualisation modes — extended with pie and heatmap. */
export type PlotChartType = 'line' | 'area' | 'scatter' | 'bar' | 'histogram' | 'pie' | 'heatmap';

/** A horizontal reference line. */
export interface PlotThreshold {
	value: number;
	label?: string;
	color?: string;
	lineStyle?: 'solid' | 'dashed' | 'dotted';
}

/** A point annotation rendered as a pin/marker. */
export interface PlotAnnotation {
	x: number;
	y: number;
	label: string;
	color?: string;
}

/** A highlighted x-axis period (vertical band). */
export interface PlotPeriod {
	xStart: number;
	xEnd: number;
	label?: string;
	color?: string;
}

/** A single named slice for pie / donut charts. */
export interface PlotPieSlice {
	name: string;
	value: number;
	color?: string;
}

/** Data for a heatmap chart (e.g. confusion matrix). */
export interface PlotHeatmapData {
	/** Labels for the x-axis (columns). */
	xLabels: string[];
	/** Labels for the y-axis (rows). */
	yLabels: string[];
	/** Heatmap cells as [xIndex, yIndex, value] triples. */
	data: [number, number, number][];
	xAxisName?: string;
	yAxisName?: string;
}

/** Parameters passed to every chart-type option builder. */
export interface BuildOptionParams {
	series: PlotSeries[];
	histogramBins?: PlotHistogramBin[];
	xAxisName?: string;
	yAxisName?: string;
	xAxisScale?: PlotAxisScale;
	pieSeries?: PlotPieSlice[];
	heatmapData?: PlotHeatmapData;
	title: string;
	downloadFilename: string;
	thresholds: PlotThreshold[];
	annotations: PlotAnnotation[];
	periods: PlotPeriod[];
	i18nDownload: string;
	i18nNoData?: string;
}

/** Contract for a single chart-type configuration entry. */
export interface PlotChartTypeConfig {
	buildOption: (params: BuildOptionParams) => echarts.EChartsOption;
}
