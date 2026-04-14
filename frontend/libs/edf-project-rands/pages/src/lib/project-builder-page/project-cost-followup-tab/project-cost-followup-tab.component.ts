import { CommonModule } from '@angular/common';
import { AfterViewInit, ChangeDetectionStrategy, Component, ElementRef, OnDestroy, computed, effect, inject, input, output, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ProjectCostTrackingData } from '@edf/edf-project-rands/models';
import { EntityFile } from '@foundation/files/models';
import { FileModals } from '@foundation/files/modals';
import { FilesRepository } from '@foundation/files/state';
import { FileThumbnailComponent, UploadButtonComponent } from '@foundation/files/ui';
import { RequestService } from '@foundation/network/services';
import * as echarts from 'echarts';

@Component({
	selector: 'lib-project-cost-followup-tab',
	standalone: true,
	imports: [CommonModule, FormsModule, FileThumbnailComponent, UploadButtonComponent],
	templateUrl: './project-cost-followup-tab.component.html',
	styleUrl: './project-cost-followup-tab.component.css',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProjectCostFollowupTabComponent implements AfterViewInit, OnDestroy {
	private _requestService = inject(RequestService);
	private _fileModals = inject(FileModals);
	private _filesRepository = inject(FilesRepository);

	private _chartHost = viewChild<ElementRef<HTMLDivElement>>('chartHost');
	private _chartInstance: echarts.ECharts | null = null;

	projectCode = input<string | null>(null);
	selectedFileId = input<string | null>(null);
	selectedFileIdChange = output<string | null>();

	selectedFile = signal<EntityFile | null>(null);
	followupData = signal<ProjectCostTrackingData | null>(null);
	isLoading = signal(false);
	errorMessage = signal<string | null>(null);
	selectedDisplayMode = signal<'cumulative' | 'monthly'>('cumulative');

	monthColumns = computed(() =>
		(this.followupData()?.months ?? []).map((month) => ({
			key: month,
			label: this._formatMonthLabel(month),
		}))
	);

	contributorRows = computed(() => {
		const data = this.followupData();
		const months = this.monthColumns();
		const isCumulative = this.selectedDisplayMode() === 'cumulative';
		if (!data) return [];

		return data.contributors.map((contributor) => {
			let runningTotal = 0;
			const displayedMonthlyHours: Record<string, number> = {};

			for (const month of months) {
				const monthlyValue = contributor.monthlyHours[month.key] ?? 0;
				runningTotal += monthlyValue;
				displayedMonthlyHours[month.key] = isCumulative ? roundTo2(runningTotal) : monthlyValue;
			}

			return {
				...contributor,
				displayedMonthlyHours,
				displayedTotalHours: isCumulative ? roundTo2(runningTotal) : contributor.totalHours,
			};
		});
	});

	totalHoursByMonth = computed(() => {
		const data = this.followupData();
		const months = this.monthColumns();
		const isCumulative = this.selectedDisplayMode() === 'cumulative';
		if (!data) return {};

		let runningTotal = 0;
		const values: Record<string, number> = {};
		for (const month of months) {
			const monthlyValue = data.totalHoursByMonth[month.key] ?? 0;
			runningTotal += monthlyValue;
			values[month.key] = isCumulative ? roundTo2(runningTotal) : monthlyValue;
		}
		return values;
	});

	chartRows = computed(() => {
		const months = this.monthColumns();
		return this.contributorRows().flatMap((contributor) =>
			months.map((month, monthIndex) => ({
				monthKey: month.key,
				monthLabel: month.label,
				monthIndex,
				contributorKey: contributor.contributorKey,
				contributorName: contributor.contributorName,
				value: contributor.displayedMonthlyHours[month.key] ?? 0,
			}))
		);
	});

	constructor() {
		effect(() => {
			const host = this._chartHost()?.nativeElement;
			if (!host) return;

			if (this._chartInstance) {
				this._chartInstance.dispose();
				this._chartInstance = null;
			}

			this._chartInstance = echarts.init(host);
			this._updateChart();
		});

		effect((onCleanup) => {
			const fileId = this.selectedFileId();
			if (!fileId) {
				this.selectedFile.set(null);
				return;
			}

			const subscription = this._filesRepository.store.getObjectByIdPullOnce$$$(fileId).$.subscribe((file) => {
				this.selectedFile.set(file);
			});

			onCleanup(() => subscription.unsubscribe());
		});

		effect((onCleanup) => {
			const fileId = this.selectedFileId();
			const projectCode = this.projectCode();

			if (!fileId || !projectCode) {
				this.followupData.set(null);
				this.errorMessage.set(null);
				this.isLoading.set(false);
				return;
			}

			this.isLoading.set(true);
			this.errorMessage.set(null);

			const subscription = this._requestService
				.post$<ProjectCostTrackingData, { fileId: string; projectCode: string }>(
					'/api/edf/rand/projects/cost-followup-from-file',
					{ fileId, projectCode },
					{ silentError: true }
				)
				.subscribe((response) => {
					this.isLoading.set(false);
					if (response.error || !response.result) {
						this.followupData.set(null);
						this.errorMessage.set(response.error?.description || response.error?.title || 'Impossible de charger le suivi des coûts.');
						return;
					}

					this.followupData.set(response.result);
				});

			onCleanup(() => subscription.unsubscribe());
		});

		effect(() => {
			this.followupData();
			this.selectedDisplayMode();
			queueMicrotask(() => this._updateChart());
		});
	}

	ngAfterViewInit() {
		window.addEventListener('resize', this._handleResize);
	}

	ngOnDestroy() {
		window.removeEventListener('resize', this._handleResize);
		this._chartInstance?.dispose();
	}

	selectExistingFile() {
		this._fileModals
			.openFilesSelectionDialog({
				selectionConstraints: {
					single: true,
					maxFiles: 1,
					minFiles: 1,
				},
			})
			.closed.subscribe((result) => {
				const fileId = result?.files?.[0]?.id;
				if (!fileId) return;
				this.selectedFileIdChange.emit(fileId);
			});
	}

	processUploadedFiles(files: (EntityFile | undefined)[]) {
		const fileId = files.find((file) => !!file)?.id;
		if (!fileId) return;
		this.selectedFileIdChange.emit(fileId);
	}

	clearSelectedFile() {
		this.selectedFileIdChange.emit(null);
	}

	setDisplayMode(displayMode: 'cumulative' | 'monthly') {
		this.selectedDisplayMode.set(displayMode);
	}

	private _updateChart() {
		if (!this._chartInstance) return;

		const data = this.followupData();
		const months = this.monthColumns();
		const isCumulative = this.selectedDisplayMode() === 'cumulative';
		const contributorRows = this.contributorRows();
		const chartRows = this.chartRows();

		this._chartInstance.clear();
		if (!data || months.length === 0 || data.contributors.length === 0) return;

		const datasetWithFilters: echarts.DatasetComponentOption[] = [];
		const seriesList: echarts.SeriesOption[] = [];

		echarts.util.each(contributorRows, (contributor) => {
			const datasetId = `dataset_${contributor.contributorKey}`;
			datasetWithFilters.push({
				id: datasetId,
				fromDatasetId: 'dataset_raw',
				transform: {
					type: 'filter',
					config: {
						and: [{ dimension: 'contributorKey', '=': contributor.contributorKey }],
					},
				},
			});
			seriesList.push({
				type: 'line',
				datasetId,
				showSymbol: false,
				name: contributor.contributorName,
				endLabel: {
					show: true,
					formatter: (params: any) => `${params.data?.contributorName ?? contributor.contributorName}: ${params.data?.value ?? 0}`,
				},
				labelLayout: {
					moveOverlap: 'shiftY',
				},
				emphasis: {
					focus: 'series',
				},
				encode: {
					x: 'monthLabel',
					y: 'value',
					label: ['contributorName', 'value'],
					itemName: 'monthLabel',
					tooltip: ['value'],
				},
			});
		});

		const option: echarts.EChartsOption = {
			animationDuration: 10000,
			dataset: [
				{
					id: 'dataset_raw',
					source: chartRows,
				},
				...datasetWithFilters,
			],
			grid: {
				// left: 48,
				right: 180,
				// top: 24,
				// bottom: 48,
			},
			tooltip: {
				order: 'valueDesc',
				trigger: 'axis',
			},
			// legend: {
			// 	type: 'scroll',
			// 	top: 0,
			// },
			toolbox: {
				feature: {
					saveAsImage: {
						name: 'suivi-des-couts',
						title: 'Télécharger',
						pixelRatio: 2,
					},
				},
			},
			xAxis: {
				type: 'category',
				data: months.map((month) => month.label),
				nameLocation: 'middle',
			},
			yAxis: {
				type: 'value',
				name: isCumulative ? 'Heures cumulées' : 'Heures',
			},
			series: seriesList,
		};

		this._chartInstance.setOption(option, true);
		setTimeout(() => this._chartInstance?.resize(), 100);
	}

	private _formatMonthLabel(month: string) {
		const [year, monthNumber] = month.split('-');
		if (!year || !monthNumber) return month;
		return `${monthNumber}/${year}`;
	}

	private _handleResize = () => {
		this._chartInstance?.resize();
	};
}

function roundTo2(value: number): number {
	return Math.round(value * 100) / 100;
}
