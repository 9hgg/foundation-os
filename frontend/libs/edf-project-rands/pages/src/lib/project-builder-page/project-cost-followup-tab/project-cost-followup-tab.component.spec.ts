import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { FilesRepository } from '@foundation/files/state';
import { FileModals } from '@foundation/files/modals';
import { RequestService } from '@foundation/network/services';
import { ProjectCostFollowupTabComponent } from './project-cost-followup-tab.component';

describe('ProjectCostFollowupTabComponent', () => {
	let filesRepository: { store: { getObjectByIdPullOnce$$$: ReturnType<typeof vi.fn> } };
	let fileModals: { openFilesSelectionDialog: ReturnType<typeof vi.fn> };

	beforeEach(() => {
		filesRepository = {
			store: {
				getObjectByIdPullOnce$$$: vi.fn((id: string) => ({ $: of({ id, name: `File ${id}` }) })),
			},
		};
		fileModals = {
			openFilesSelectionDialog: vi.fn().mockReturnValue({ closed: of({ files: [{ id: 'file-2' }] }) }),
		};
		TestBed.configureTestingModule({
			providers: [
				{
					provide: RequestService,
					useValue: {
						post$: vi.fn().mockReturnValue(of({ result: { months: [], contributors: [], totalHoursByMonth: {} } })),
					},
				},
				{ provide: FileModals, useValue: fileModals },
				{ provide: FilesRepository, useValue: filesRepository },
			],
		});
	});

	function createComponent() {
		const component = TestBed.runInInjectionContext(() => new ProjectCostFollowupTabComponent()) as any;
		component.selectedFileIdChange = { emit: vi.fn() };
		component.followupData.set({
			months: ['2025-01', '2025-02'],
			contributors: [
				{ contributorKey: 'alice', contributorName: 'Alice', monthlyHours: { '2025-01': 1.1, '2025-02': 2.2 }, totalHours: 3.3 },
				{ contributorKey: 'bob', contributorName: 'Bob', monthlyHours: { '2025-01': 3, '2025-02': 0.5 }, totalHours: 3.5 },
			],
			totalHoursByMonth: { '2025-01': 4.1, '2025-02': 2.7 },
		});
		component._chartInstance = {
			clear: vi.fn(),
			setOption: vi.fn(),
			resize: vi.fn(),
			dispose: vi.fn(),
		};
		return component;
	}

	it('builds month columns, contributor rows, totals, and chart rows', () => {
		const component = createComponent();

		expect(component.monthColumns()).toEqual([
			{ key: '2025-01', label: '01/2025' },
			{ key: '2025-02', label: '02/2025' },
		]);
		expect(component.contributorRows()[0]).toEqual(
			expect.objectContaining({
				displayedMonthlyHours: { '2025-01': 1.1, '2025-02': 3.3 },
				displayedTotalHours: 3.3,
			})
		);
		expect(component.totalHoursByMonth()).toEqual({ '2025-01': 4.1, '2025-02': 6.8 });
		expect(component.chartRows()).toHaveLength(4);

		component.setDisplayMode('monthly');
		expect(component.contributorRows()[1].displayedMonthlyHours).toEqual({ '2025-01': 3, '2025-02': 0.5 });
		expect(component.totalHoursByMonth()).toEqual({ '2025-01': 4.1, '2025-02': 2.7 });
		expect(component._formatMonthLabel('bad-value')).toBe('value/bad');
	});

	it('selects, uploads, clears files, and updates the chart lifecycle', () => {
		vi.useFakeTimers();
		const component = createComponent();
		const addSpy = vi.spyOn(window, 'addEventListener');
		const removeSpy = vi.spyOn(window, 'removeEventListener');

		component.selectExistingFile();
		component.processUploadedFiles([undefined, { id: 'file-3' } as any]);
		component.clearSelectedFile();
		component._updateChart();
		component.ngAfterViewInit();
		component._handleResize();
		component.ngOnDestroy();
		vi.runAllTimers();

		expect(fileModals.openFilesSelectionDialog).toHaveBeenCalled();
		expect(component.selectedFileIdChange.emit).toHaveBeenCalledWith('file-2');
		expect(component.selectedFileIdChange.emit).toHaveBeenCalledWith('file-3');
		expect(component.selectedFileIdChange.emit).toHaveBeenCalledWith(null);
		expect(component._chartInstance.clear).toHaveBeenCalled();
		expect(component._chartInstance.setOption).toHaveBeenCalled();
		expect(component._chartInstance.resize).toHaveBeenCalled();
		expect(component._chartInstance.dispose).toHaveBeenCalled();
		expect(addSpy).toHaveBeenCalledWith('resize', component._handleResize);
		expect(removeSpy).toHaveBeenCalledWith('resize', component._handleResize);

		addSpy.mockRestore();
		removeSpy.mockRestore();
		vi.useRealTimers();
	});
});
