import { ChangeDetectionStrategy, Component, effect, ElementRef, inject, input, OnDestroy, signal, untracked, viewChild } from '@angular/core';
import * as echarts from 'echarts';
import { TranslationService } from '@foundation/translations/services';

import { PLOT_CHART_CONFIGS } from './configs/index';
import type { PlotAnnotation, PlotAxisScale, PlotChartType, PlotHeatmapData, PlotHistogramBin, PlotPeriod, PlotPieSlice, PlotSeries, PlotThreshold } from './plot.models';

@Component({
	selector: 'lib-plot',
	imports: [],
	templateUrl: './plot.component.html',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PlotComponent implements OnDestroy {
	/** Data series to display. Optional — pie and heatmap charts do not use it. */
	series = input<PlotSeries[]>([]);

	/** Slices for pie / donut charts. */
	pieSeries = input<PlotPieSlice[]>([]);

	/** Pre-computed histogram bins, used when sending raw samples would be wasteful. */
	histogramBins = input<PlotHistogramBin[]>([]);

	/** Data for heatmap charts. */
	heatmapData = input<PlotHeatmapData | null>(null);

	/** Which chart types are available for selection. Defaults to line + histogram. */
	availableChartTypes = input<PlotChartType[]>(['line', 'histogram']);

	/** Chart title shown above the plot. */
	title = input<string>('');

	/** Labels and scale for numeric axes on line charts. */
	xAxisName = input<string>('');
	yAxisName = input<string>('');
	xAxisScale = input<PlotAxisScale>('linear');

	/** File name (without extension) used by the "Save as image" toolbar button. */
	downloadFilename = input<string>('chart');

	/** Horizontal reference lines drawn across the chart. */
	thresholds = input<PlotThreshold[]>([]);

	/** Point annotations rendered as pins/markers on the chart. */
	annotations = input<PlotAnnotation[]>([]);

	/** Highlighted x-axis periods rendered as vertical bands. */
	periods = input<PlotPeriod[]>([]);

	/** Height of the chart container. Defaults to '384px' (h-96). */
	height = input<string>('384px');

	/** Currently active chart type (internal state, user-switchable via buttons). */
	activeChartType = signal<PlotChartType>('line');

	/** Width of the chart container in pixels. */
	containerWidth = signal<number>(0);

	private _chartContainerRef = viewChild<ElementRef<HTMLElement>>('chartContainer');
	private _chartInstance: echarts.ECharts | null = null;
	private _translationService = inject(TranslationService);

	private _i18n_chartTypeLabels: Record<PlotChartType, () => string> = {
		line: this._translationService.prep('Courbes'),
		area: this._translationService.prep('Aires'),
		scatter: this._translationService.prep('Nuage de points'),
		bar: this._translationService.prep('Barres'),
		histogram: this._translationService.prep('Histogramme'),
		pie: this._translationService.prep('Camembert'),
		heatmap: this._translationService.prep('Carte de chaleur'),
	};
	private _i18n_download = this._translationService.prep('Télécharger');
	private _i18n_noData = this._translationService.prep('Aucune donnée');

	constructor() {
		// Sync activeChartType to the first available type whenever the list changes.
		effect(() => {
			const types = this.availableChartTypes();
			if (types.length > 0 && !types.includes(untracked(() => this.activeChartType()))) {
				this.activeChartType.set(types[0]);
			}
		});

		// Initialise (or re-initialise) the chart when the container DOM element is ready.
		effect(() => {
			const containerRef = this._chartContainerRef();
			if (containerRef?.nativeElement) {
				untracked(() => {
					this._initChart(containerRef.nativeElement);
					this._updateChart();
				});
			}
		});

		// Re-render whenever any input driving the chart changes.
		effect(() => {
			// Track reactive dependencies.
			this.series();
			this.pieSeries();
			this.histogramBins();
			this.heatmapData();
			this.thresholds();
			this.annotations();
			this.periods();
			this.xAxisName();
			this.yAxisName();
			this.xAxisScale();
			this.activeChartType();
			untracked(() => this._updateChart());
		});
	}

	ngOnDestroy(): void {
		this._chartInstance?.dispose();
		this._chartInstance = null;
	}

	/** Switch the active visualisation mode. */
	setChartType(type: PlotChartType): void {
		this.activeChartType.set(type);
	}

	/** Human-readable label for a chart type. */
	chartTypeLabel(type: PlotChartType): string {
		return this._i18n_chartTypeLabels[type]();
	}

	// ─── Private helpers ─────────────────────────────────────────────────────

	private _initChart(element: HTMLElement): void {
		this._chartInstance?.dispose();
		this._chartInstance = echarts.init(element);
		this.containerWidth.set(element.clientWidth);
	}

	private _updateChart(): void {
		if (!this._chartInstance) return;

		const seriesList = this.series();
		const hasSeries = seriesList.length > 0 && seriesList.some((s) => s.points?.length);
		const hasPie = this.pieSeries().length > 0;
		const hasHeatmap = this.heatmapData() !== null;
		const hasHistogramBins = this.histogramBins().length > 0;
		if (!hasSeries && !hasPie && !hasHeatmap && !hasHistogramBins) return;

		const option = PLOT_CHART_CONFIGS[this.activeChartType()].buildOption({
			series: seriesList,
			histogramBins: this.histogramBins(),
			xAxisName: this.xAxisName(),
			yAxisName: this.yAxisName(),
			xAxisScale: this.xAxisScale(),
			pieSeries: this.pieSeries(),
			heatmapData: this.heatmapData() ?? undefined,
			title: this.title(),
			downloadFilename: this.downloadFilename(),
			thresholds: this.thresholds(),
			annotations: this.annotations(),
			periods: this.periods(),
			i18nDownload: this._i18n_download(),
			i18nNoData: this._i18n_noData(),
		});

		this._chartInstance?.setOption(option, true);
		requestAnimationFrame(() => this._chartInstance?.resize());
	}
}
