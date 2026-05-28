import * as echarts from 'echarts';
import type { BuildOptionParams } from '../plot.models';

export function buildHeatmapOption({ heatmapData, title }: BuildOptionParams): echarts.EChartsOption {
	if (!heatmapData) return {};

	const { xLabels, yLabels, data, xAxisName, yAxisName } = heatmapData;
	const n = Math.max(xLabels.length, yLabels.length);
	const maxValue = data.reduce((max, [, , v]) => Math.max(max, v), 0);

	// Tooltip type guard
	interface HeatmapTooltipParam { value?: unknown; }
	function isHeatmapTooltipParam(p: unknown): p is HeatmapTooltipParam {
		return p !== null && typeof p === 'object';
	}

	return {
		title: { text: title, left: 'center', textStyle: { color: '#333', fontSize: 14, fontWeight: 'bold' } },
		tooltip: {
			position: 'top',
			formatter: (rawParams: unknown): string => {
				const p = Array.isArray(rawParams) ? rawParams[0] : rawParams;
				if (!isHeatmapTooltipParam(p) || !Array.isArray(p.value)) return '';
				const xIdx = Number(p.value[0]);
				const yIdx = Number(p.value[1]);
				const count = Number(p.value[2]);
				const xLabel = xLabels[xIdx] ?? '?';
				const yLabel = yLabels[yIdx] ?? '?';
				return `<b>${yLabel}</b> → <b>${xLabel}</b><br/>Count: ${count}`;
			},
		},
		grid: {
			left: n > 5 ? '22%' : '18%',
			right: '4%',
			bottom: n > 5 ? '22%' : '18%',
			top: title ? '12%' : '6%',
		},
		xAxis: {
			type: 'category',
			data: xLabels,
			name: xAxisName,
			nameLocation: 'middle',
			nameGap: n > 5 ? 55 : 40,
			axisLabel: { rotate: n > 4 ? 35 : 0, fontSize: 10, overflow: 'truncate', width: 80 },
			splitArea: { show: true },
		},
		yAxis: {
			type: 'category',
			data: yLabels,
			name: yAxisName,
			nameLocation: 'middle',
			nameGap: n > 5 ? 100 : 80,
			axisLabel: { fontSize: 10, overflow: 'truncate', width: n > 5 ? 90 : 70 },
			splitArea: { show: true },
		},
		visualMap: {
			min: 0,
			max: maxValue || 1,
			calculable: false,
			show: false,
			inRange: { color: ['#e8f0fe', '#1a56db'] },
		},
		series: [
			{
				type: 'heatmap',
				data,
				label: {
					show: true,
					fontSize: n > 6 ? 9 : 11,
					formatter: (rawParams: unknown): string => {
						if (!isHeatmapTooltipParam(rawParams) || !Array.isArray(rawParams.value)) return '';
						const count = Number(rawParams.value[2]);
						return count > 0 ? String(count) : '';
					},
				},
				emphasis: { itemStyle: { shadowBlur: 10, shadowColor: 'rgba(0,0,0,0.25)' } },
			},
		],
	};
}
