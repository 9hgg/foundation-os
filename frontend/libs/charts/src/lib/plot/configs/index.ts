import type { PlotChartType, PlotChartTypeConfig } from '../plot.models';
import { buildAreaOption } from './area.config';
import { buildBarOption } from './bar.config';
import { buildHeatmapOption } from './heatmap.config';
import { buildHistogramOption } from './histogram.config';
import { buildLineOption } from './line.config';
import { buildPieOption } from './pie.config';
import { buildScatterOption } from './scatter.config';

// ─── Config map ───────────────────────────────────────────────────────────────

/**
 * Map of all supported chart-type configurations.
 * To add a new chart type, extend `PlotChartType` in `plot.models.ts`
 * and add the corresponding entry here.
 */
export const PLOT_CHART_CONFIGS: Record<PlotChartType, PlotChartTypeConfig> = {
	line: { buildOption: buildLineOption },
	area: { buildOption: buildAreaOption },
	scatter: { buildOption: buildScatterOption },
	bar: { buildOption: buildBarOption },
	histogram: { buildOption: buildHistogramOption },
	pie: { buildOption: buildPieOption },
	heatmap: { buildOption: buildHeatmapOption },
};
