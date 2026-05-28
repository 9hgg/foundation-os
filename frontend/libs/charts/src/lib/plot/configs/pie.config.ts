import * as echarts from 'echarts';
import type { BuildOptionParams } from '../plot.models';
import { buildToolbox } from './_shared';

export function buildPieOption({ pieSeries, title, downloadFilename, i18nDownload, i18nNoData }: BuildOptionParams): echarts.EChartsOption {
	const slices = pieSeries ?? [];
	const hasData = slices.some((s) => s.value > 0);

	return {
		title: { text: title, left: 'center', textStyle: { color: '#333', fontSize: 14, fontWeight: 'bold' } },
		tooltip: {
			trigger: 'item',
			formatter: '{b}<br/>{c} ({d}%)',
		},
		legend: {
			type: 'scroll',
			bottom: 0,
			left: 'center',
			textStyle: { fontSize: 11 },
		},
		toolbox: buildToolbox(downloadFilename, i18nDownload),
		series: [
			{
				name: title || 'Distribution',
				type: 'pie',
				radius: ['42%', '72%'],
				center: ['50%', '44%'],
				avoidLabelOverlap: true,
				itemStyle: { borderColor: '#ffffff', borderWidth: 2 },
				label: {
					formatter: '{b|{b}}\n{c} ({d}%)',
					lineHeight: 16,
					overflow: 'truncate',
					rich: { b: { fontSize: 11, fontWeight: 600 } },
				},
				labelLine: { length: 12, length2: 10 },
				data: slices.map((slice) => ({
					name: slice.name,
					value: slice.value,
					itemStyle: slice.color ? { color: slice.color } : undefined,
				})),
			},
		],
		graphic: hasData
			? undefined
			: [{ type: 'text', left: 'center', top: 'middle', style: { text: i18nNoData ?? 'No data', fill: '#64748B', fontSize: 14 } }],
	};
}
