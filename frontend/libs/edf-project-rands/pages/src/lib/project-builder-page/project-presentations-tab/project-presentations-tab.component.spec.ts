import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { NotificationService } from '@foundation/notification';
import { TranslationService } from '@foundation/translations/services';
import { ProjectPresentationsTabComponent } from './project-presentations-tab.component';

function createSignal<T>(initialValue: T) {
	let value = initialValue;
	const signal: any = () => value;
	signal.set = (nextValue: T) => {
		value = nextValue;
	};
	return signal as (() => T) & { set: (value: T) => void };
}

describe('ProjectPresentationsTabComponent', () => {
	let notificationService: {
		confirm: ReturnType<typeof vi.fn>;
		snackSuccess: ReturnType<typeof vi.fn>;
		snackError: ReturnType<typeof vi.fn>;
	};

	beforeEach(() => {
		notificationService = {
			confirm: vi.fn().mockReturnValue({ closed: of(true) }),
			snackSuccess: vi.fn(),
			snackError: vi.fn(),
		};
		TestBed.configureTestingModule({
			providers: [
				{ provide: NotificationService, useValue: notificationService },
				{ provide: TranslationService, useValue: { prep: (value: string) => () => value } },
			],
		});
	});

	function createComponent() {
		const component = TestBed.runInInjectionContext(() => new ProjectPresentationsTabComponent()) as any;
		const presentationChild = {
			scrollToSlide: vi.fn(),
			scrollToUpdate: vi.fn(),
			exportPresentationToPdf: vi.fn(),
		};
		component.detailedActivities = createSignal([
			{ batch: { id: 'batch-1', prefix: '1', title: 'Batch 1' }, activity: { id: 'activity-1', hidden: false }, mergedPrefix: '1.1', mergedPrefixSort: '00000001.00000001', activityTitle: 'Alpha' },
			{ batch: { id: 'batch-2', prefix: '2', title: 'Batch 2' }, activity: { id: 'activity-2', hidden: false }, mergedPrefix: '2.1', mergedPrefixSort: '00000002.00000001', activityTitle: 'Beta' },
			{ batch: { id: 'batch-2', prefix: '2', title: 'Batch 2' }, activity: { id: 'activity-3', hidden: true }, mergedPrefix: '2.2', mergedPrefixSort: '00000002.00000002', activityTitle: 'Hidden' },
		]);
		component.contributions = createSignal([{ year: 2025 }, { year: 2026 }]);
		component.purchases = createSignal([{ year: 2024 }, { year: 2026 }]);
		component.facilityUsages = createSignal([{ year: 2023 }]);
		component.contributorCategories = createSignal({});
		component.projectYears = createSignal<number[]>([]);
		component.project = createSignal({ id: 'project-1' });
		component.mainCustomer = createSignal('Main');
		component.sponsorCustomer = createSignal('Sponsor');
		component.projectManager = createSignal('PM');
		component.strategicLead = createSignal('Lead');
		component.presentationCatalogs = createSignal([
			{
				id: 'catalog-1',
				title: 'Quarterly review',
				description: 'Desc',
				selectedYears: [2026, 2024, 2026],
				includedBatchIds: ['batch-1', 'missing', 'batch-1'],
				includedActivityIds: ['activity-1', 'activity-2', 'missing'],
				orderedSlideIds: ['activities-overview', 'title'],
				includedSlideIds: ['activities-overview', 'title', 'unknown', 'title'],
				hiddenSlideIds: ['custom-1', 'missing'],
				customSlides: [{ id: 'custom-1', label: 'Custom', title: 'Slide', afterSlideId: 'title', bodyLines: ['A'] }],
			},
		]);
		component.slideCatalog = createSignal([
			{ id: 'catalog-slide-1', label: 'Catalog', title: 'Catalog Slide', subtitle: 'Sub', bodyHtml: '<p>Body</p>', bodyLines: ['Body'], includeInToc: true, showNumber: true },
		]);
		component.presentationCatalogsChange = { emit: vi.fn() };
		component.selectedPresentationCatalogId.set('catalog-1');
		component._projectPresentationTab = vi.fn(() => presentationChild);
		component.__presentationChild = presentationChild;
		return component;
	}

	it('derives presentation options, slide rows, and normalized selections', () => {
		const component = createComponent();

		expect(component.availableBatchOptions()).toEqual([
			expect.objectContaining({ id: 'batch-1', label: '1 · Batch 1' }),
			expect.objectContaining({ id: 'batch-2', label: '2 · Batch 2' }),
		]);
		expect(component.availableActivityOptions()).toEqual([
			expect.objectContaining({ id: 'activity-1', title: 'Alpha' }),
		]);
		expect(component.presentationYearOptions()).toEqual([2023, 2024, 2025, 2026]);
		expect(component.selectedPresentationCatalog()).toEqual(
			expect.objectContaining({
				selectedYears: [2024, 2026],
				includedBatchIds: ['batch-1'],
				includedActivityIds: ['activity-1', 'activity-2'],
				includedSlideIds: ['activities-overview', 'title'],
				hiddenSlideIds: ['custom-1'],
			})
		);
		expect(component.presentationSlideRows()).toEqual([
			expect.objectContaining({ id: 'activities-overview', kind: 'automatic' }),
			expect.objectContaining({ id: 'title', kind: 'automatic' }),
			expect.objectContaining({ id: 'custom-1', kind: 'catalog-slide', hiddenInFocusMode: true }),
		]);
		expect(component.visiblePresentationSlideCount()).toBe(2);
		expect(component.hiddenPresentationSlideCount()).toBe(1);
		expect(component.syncablePresentationSlideCount()).toBe(0);
		expect(component._deriveAvailableYears()).toEqual([2023, 2024, 2025, 2026]);
		expect(component._buildPrefixSortKey('Lot 2.3')).toContain('00000002');
	});

	it('updates catalogs, manages slide insertion, and forwards focus actions', () => {
		const component = createComponent();
		const clipboardSpy = vi.fn().mockResolvedValue(undefined);
		Object.defineProperty(navigator, 'clipboard', {
			value: { writeText: clipboardSpy },
			configurable: true,
		});

		component.addPresentationCatalog();
		component.duplicateSelectedPresentationCatalog();
		component.updateSelectedPresentationTitle('Updated title');
		component.updateSelectedPresentationDescription('Updated description');
		component.updateSelectedPresentationYearsFromEvent({
			target: {
				selectedOptions: [{ value: '2024' }, { value: '2026' }, { value: 'oops' }],
			},
		} as any);
		component.updateSelectedPresentationBatchIdsFromEvent({
			target: {
				selectedOptions: [{ value: 'batch-1' }, { value: '' }],
			},
		} as any);
		component.updateSelectedPresentationActivityIds(['activity-2']);
		component.updateSlideHiddenInFocusMode('title', true);
		component.startInsertion('title', 'below');
		component.updateSelectedCatalogSlideToInsert('catalog-slide-1');
		component.confirmInsertion();
		component.removeSlide('activities-overview');
		component.restoreAutomaticSlide('activities-overview');
		component.startPresentation();
		component.startPresentationAtSlide('activity-2');
		component.exportPdf();
		component.exportPdfWithDescriptions();
		component.scrollToSlide('activity-1');
		component.scrollToUpdate('update-1', 'activity-1');
		component.copyPresentationLink();

		expect(component.presentationCatalogsChange.emit).toHaveBeenCalled();
		expect(component.pendingInsertion()).toBe(null);
		expect(component.focusMode()).toBe(true);
		expect(component._pendingPresentationSlideId()).toBe('activity-2');
		expect(component._pendingPdfExport()).toBe('with-descriptions');
		expect(component.__presentationChild.scrollToSlide).toHaveBeenCalledWith('activity-1');
		expect(component.__presentationChild.scrollToUpdate).toHaveBeenCalledWith('update-1', 'activity-1');
		expect(clipboardSpy).toHaveBeenCalledWith(expect.stringContaining('/p/project-1/catalog-1'));
	});

	it('syncs and deletes presentations, handles clipboard failures, and keeps catalog helpers stable', async () => {
		const component = createComponent();
		Object.defineProperty(navigator, 'clipboard', {
			value: { writeText: vi.fn().mockRejectedValue(new Error('copy failed')) },
			configurable: true,
		});

		component._updateSelectedPresentationCatalog((catalog: any) => ({
			...catalog,
			customSlides: [{ id: 'custom-sync', catalogSlideId: 'catalog-slide-1', label: 'Old', title: 'Old', bodyLines: [] }],
		}));
		component.syncSlideFromCatalog('custom-sync');
		component.syncAllSlidesFromCatalog();
		component.deleteSelectedPresentationCatalog();
		component.cancelInsertion();
		component.copyPresentationLink();

		await Promise.resolve();

		expect(notificationService.confirm).toHaveBeenCalled();
		expect(notificationService.snackError).toHaveBeenCalled();
		expect(component._restoreAutomaticSlideOrder(['title'], 'activities-overview', ['title', 'activities-overview'])).toEqual(['title', 'activities-overview']);
		expect(component._insertCustomSlides([{ id: 'title', label: 'L', title: 'T', kind: 'automatic', hiddenInFocusMode: false }], [{ id: 'custom-x', label: 'X', title: 'X', beforeSlideId: 'title' }], new Set())).toEqual([
			expect.objectContaining({ id: 'custom-x' }),
			expect.objectContaining({ id: 'title' }),
		]);
	});
});
