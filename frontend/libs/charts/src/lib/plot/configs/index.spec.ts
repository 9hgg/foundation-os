import { buildAreaOption } from './area.config';
import { buildBarOption } from './bar.config';
import { buildHeatmapOption } from './heatmap.config';
import { buildHistogramOption } from './histogram.config';
import { PLOT_CHART_CONFIGS } from './index';
import { buildLineOption } from './line.config';
import { buildPieOption } from './pie.config';
import { buildScatterOption } from './scatter.config';

describe('PLOT_CHART_CONFIGS', () => {
	it('covers every supported chart type, and nothing else', () => {
		expect(Object.keys(PLOT_CHART_CONFIGS).sort()).toEqual(['area', 'bar', 'heatmap', 'histogram', 'line', 'pie', 'scatter']);
	});

	it('points each type at its own option builder', () => {
		expect(PLOT_CHART_CONFIGS.line.buildOption).toBe(buildLineOption);
		expect(PLOT_CHART_CONFIGS.area.buildOption).toBe(buildAreaOption);
		expect(PLOT_CHART_CONFIGS.scatter.buildOption).toBe(buildScatterOption);
		expect(PLOT_CHART_CONFIGS.bar.buildOption).toBe(buildBarOption);
		expect(PLOT_CHART_CONFIGS.histogram.buildOption).toBe(buildHistogramOption);
		expect(PLOT_CHART_CONFIGS.pie.buildOption).toBe(buildPieOption);
		expect(PLOT_CHART_CONFIGS.heatmap.buildOption).toBe(buildHeatmapOption);
	});
});
