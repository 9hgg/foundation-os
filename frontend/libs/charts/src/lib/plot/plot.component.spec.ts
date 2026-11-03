import { TestBed } from '@angular/core/testing';
import { TranslationService } from '@foundation/translations/services';
import type { EChartsOption } from 'echarts';
import { PlotComponent } from './plot.component';

const chartInstance = { setOption: vi.fn(), resize: vi.fn(), dispose: vi.fn() };
const init = vi.fn(() => chartInstance);

// echarts renders to a canvas, which jsdom does not implement -- the chart itself is a stand-in so the
// option the component hands it stays assertable.
vi.mock('echarts', () => ({ init: (...args: unknown[]) => init(...args) }));

describe('PlotComponent', () => {
	const buildFixture = (inputs: Record<string, unknown> = {}) => {
		TestBed.configureTestingModule({
			providers: [{ provide: TranslationService, useValue: { prep: (value: string) => () => value } }],
		});

		const fixture = TestBed.createComponent(PlotComponent);
		for (const [name, value] of Object.entries(inputs)) fixture.componentRef.setInput(name, value);
		fixture.detectChanges();

		return { fixture, component: fixture.componentInstance };
	};

	const lastOption = (): EChartsOption => chartInstance.setOption.mock.calls.at(-1)?.[0];

	beforeEach(() => {
		init.mockClear();
		chartInstance.setOption.mockClear();
		chartInstance.resize.mockClear();
		chartInstance.dispose.mockClear();
	});

	afterEach(() => TestBed.resetTestingModule());

	describe('the chart type toggle', () => {
		it('offers line and histogram by default, starting on line', () => {
			const { component } = buildFixture();

			expect(component.availableChartTypes()).toEqual(['line', 'histogram']);
			expect(component.activeChartType()).toBe('line');
		});

		it('falls back to the first available type when line is not offered', () => {
			const { component } = buildFixture({ availableChartTypes: ['pie', 'heatmap'] });

			expect(component.activeChartType()).toBe('pie');
		});

		it('keeps the active type when it is still offered', () => {
			const { fixture, component } = buildFixture({ availableChartTypes: ['line', 'area'] });
			component.setChartType('area');

			fixture.componentRef.setInput('availableChartTypes', ['area', 'bar']);
			fixture.detectChanges();

			expect(component.activeChartType()).toBe('area');
		});

		it('leaves the active type alone when the list is emptied', () => {
			const { fixture, component } = buildFixture();

			fixture.componentRef.setInput('availableChartTypes', []);
			fixture.detectChanges();

			expect(component.activeChartType()).toBe('line');
		});

		it('switches the active type on demand', () => {
			const { component } = buildFixture({ availableChartTypes: ['line', 'bar'] });

			component.setChartType('bar');

			expect(component.activeChartType()).toBe('bar');
		});

		it('shows a button per type once there is more than one', () => {
			const { fixture } = buildFixture({ availableChartTypes: ['line', 'bar', 'pie'] });

			expect(fixture.nativeElement.querySelectorAll('button')).toHaveLength(3);
		});

		it('hides the toggle when there is only one type to pick', () => {
			const { fixture } = buildFixture({ availableChartTypes: ['line'] });

			expect(fixture.nativeElement.querySelectorAll('button')).toHaveLength(0);
		});

		it('names every type it can show', () => {
			const { component } = buildFixture();

			expect(component.chartTypeLabel('line')).toBe('Courbes');
			expect(component.chartTypeLabel('area')).toBe('Aires');
			expect(component.chartTypeLabel('scatter')).toBe('Nuage de points');
			expect(component.chartTypeLabel('bar')).toBe('Barres');
			expect(component.chartTypeLabel('histogram')).toBe('Histogramme');
			expect(component.chartTypeLabel('pie')).toBe('Camembert');
			expect(component.chartTypeLabel('heatmap')).toBe('Carte de chaleur');
		});
	});

	describe('the chart itself', () => {
		const series = [{ name: 'Temperature', points: [[0, 1], [1, 2]] as [number, number][] }];

		it('initialises on the container element and records its width', () => {
			const { component } = buildFixture({ series });

			expect(init).toHaveBeenCalledTimes(1);
			expect(component.containerWidth()).toBe(0);
		});

		it('renders nothing while there is no data of any kind', () => {
			buildFixture();

			expect(chartInstance.setOption).not.toHaveBeenCalled();
		});

		it('renders nothing for series that are all empty', () => {
			buildFixture({ series: [{ name: 'A', points: [] }] });

			expect(chartInstance.setOption).not.toHaveBeenCalled();
		});

		it('renders from series alone', () => {
			buildFixture({ series });

			expect(chartInstance.setOption).toHaveBeenCalled();
		});

		it('renders from pie slices alone', () => {
			buildFixture({ availableChartTypes: ['pie'], pieSeries: [{ name: 'Yes', value: 1 }] });

			expect(chartInstance.setOption).toHaveBeenCalled();
		});

		it('renders from heatmap data alone', () => {
			buildFixture({ availableChartTypes: ['heatmap'], heatmapData: { xLabels: ['a'], yLabels: ['b'], data: [[0, 0, 1]] } });

			expect(chartInstance.setOption).toHaveBeenCalled();
		});

		it('renders from pre-computed histogram bins alone', () => {
			buildFixture({ availableChartTypes: ['histogram'], histogramBins: [{ lower: 0, upper: 1, value: 2 }] });

			expect(chartInstance.setOption).toHaveBeenCalled();
		});

		it('builds the option with the builder of the active type', () => {
			const { fixture, component } = buildFixture({ availableChartTypes: ['line', 'bar'], series });

			component.setChartType('bar');
			fixture.detectChanges();

			expect(lastOption().series?.[0]).toMatchObject({ type: 'bar' });
		});

		it('passes the title, download name and axis labels through', () => {
			buildFixture({ series, title: 'Cooling', downloadFilename: 'cooling', xAxisName: 'Distance', yAxisName: '°C' });

			expect(lastOption().title).toMatchObject({ text: 'Cooling' });
			expect(lastOption().toolbox?.feature?.saveAsImage).toMatchObject({ name: 'cooling', title: 'Télécharger' });
			expect(lastOption().xAxis).toMatchObject({ name: 'Distance' });
			expect(lastOption().yAxis).toMatchObject({ name: '°C' });
		});

		it('passes the translated no-data message down to the chart that needs it', () => {
			buildFixture({ availableChartTypes: ['pie'], pieSeries: [{ name: 'Yes', value: 0 }] });

			expect(lastOption().graphic).toMatchObject([{ style: { text: 'Aucune donnée' } }]);
		});

		it('passes the overlays through', () => {
			buildFixture({ series, thresholds: [{ value: 5 }], annotations: [{ x: 1, y: 2, label: 'Here' }], periods: [{ xStart: 0, xEnd: 1 }] });

			expect(lastOption().series).toHaveLength(2);
		});

		it('passes the legend, stacking and stepping flags through', () => {
			buildFixture({ series, showLegend: true, stacked: true, step: true });

			expect(lastOption().legend).toMatchObject({ data: ['Temperature'] });
			expect(lastOption().series?.[0]).toMatchObject({ stack: 'total', step: 'end' });
		});

		it('replaces the option wholesale rather than merging into the previous chart', () => {
			buildFixture({ series });

			expect(chartInstance.setOption.mock.calls.at(-1)?.[1]).toBe(true);
		});

		it('re-renders when the data changes', () => {
			const { fixture } = buildFixture({ series });
			const before = chartInstance.setOption.mock.calls.length;

			fixture.componentRef.setInput('series', [{ name: 'Temperature', points: [[0, 5]] }]);
			fixture.detectChanges();

			expect(chartInstance.setOption.mock.calls.length).toBeGreaterThan(before);
		});

		it('resizes itself on the next frame, so a container that just appeared is measured', async () => {
			buildFixture({ series });

			await new Promise((resolve) => requestAnimationFrame(resolve));

			expect(chartInstance.resize).toHaveBeenCalled();
		});

		it('disposes the chart when the component goes away', () => {
			const { component } = buildFixture({ series });

			component.ngOnDestroy();

			expect(chartInstance.dispose).toHaveBeenCalled();
		});
	});

	it('gives the container the requested height, defaulting to h-96', () => {
		const { fixture } = buildFixture();
		expect(fixture.nativeElement.querySelector('div[class*="rounded"]').style.height).toBe('384px');

		fixture.componentRef.setInput('height', '200px');
		fixture.detectChanges();
		expect(fixture.nativeElement.querySelector('div[class*="rounded"]').style.height).toBe('200px');
	});
});
