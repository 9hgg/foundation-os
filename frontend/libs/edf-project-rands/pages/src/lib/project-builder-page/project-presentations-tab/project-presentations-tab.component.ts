import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, inject, input, model, output, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
	AnnualContribution,
	AnnualFacilityUsage,
	CategoryEnum,
	Project,
	ProjectPresentationCatalog,
	ProjectPresentationCustomSlide,
	ProjectPresentationSlideCatalogEntry,
	Purchase,
} from '@edf/edf-project-rands/models';
import { DetailedActivity } from '@edf/edf-project-rands/ui';
import { TwChevronDownIcon, TwChevronUpIcon, TwDeleteIcon, TwPlayIcon, TwRestartIcon } from '@foundation/icons';
import { NotificationService } from '@foundation/notification';
import { TranslationService } from '@foundation/translations/services';
import { ProjectPresentationTabComponent } from '../project-presentation-tab/project-presentation-tab.component';

interface PresentationAutomaticSlideOption {
	id: string;
	label: string;
	title: string;
	kind: 'static' | 'activity';
}

interface PresentationBatchOption {
	id: string;
	label: string;
	description: string;
	sortKey: string;
}

interface PresentationActivityOption {
	id: string;
	label: string;
	title: string;
	batchId: string;
	sortKey: string;
}

interface PresentationSlideRow {
	id: string;
	label: string;
	title: string;
	kind: 'automatic' | 'catalog-slide';
	catalogSlideId?: string;
	hiddenInFocusMode: boolean;
}

interface PendingSlideInsertion {
	anchorSlideId: string | null;
	position: 'above' | 'below';
}

const DEFAULT_PRESENTATION_INTRO_SLIDES: PresentationAutomaticSlideOption[] = [
	{ id: 'title', label: 'Ouverture', title: 'Présentation du projet', kind: 'static' },
	{ id: 'project-identity', label: 'Projet', title: "Carte d'identité du projet", kind: 'static' },
	{ id: 'activities-overview', label: 'Activités', title: 'Synthèse des activités', kind: 'static' },
	{ id: 'year-budget-overview', label: 'Activités', title: 'Budget par an', kind: 'static' },
	{ id: 'batch-budget-overview', label: 'Activités', title: 'Budgets par lot', kind: 'static' },
	{ id: 'batch-budget-share', label: 'Activités', title: 'Répartition totale par lot', kind: 'static' },
	{ id: 'effort-tracking', label: 'Suivi', title: "Suivi des contributions", kind: 'static' },
];

const DEFAULT_PRESENTATION_OUTRO_SLIDES: PresentationAutomaticSlideOption[] = [
	{ id: 'activities-overview-closing', label: 'Activités', title: 'Synthèse et inflexions', kind: 'static' },
	{ id: 'thank-you', label: 'Clôture', title: 'Merci', kind: 'static' },
];

@Component({
	selector: 'lib-project-presentations-tab',
	standalone: true,
	imports: [CommonModule, FormsModule, ProjectPresentationTabComponent, TwPlayIcon, TwChevronUpIcon, TwChevronDownIcon, TwDeleteIcon, TwRestartIcon],
	templateUrl: './project-presentations-tab.component.html',
	styleUrl: './project-presentations-tab.component.css',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProjectPresentationsTabComponent {
	private _notificationService = inject(NotificationService);
	private _translationService = inject(TranslationService);
	private _projectPresentationTab = viewChild(ProjectPresentationTabComponent);
	private _i18n_deletePresentationTitle = this._translationService.prep('Supprimer la présentation');
	private _i18n_deletePresentationConfirm = this._translationService.prep('Supprimer');
	private _i18n_deletePresentationMessage = this._translationService.prep('Voulez-vous vraiment supprimer cette présentation ?');
	private _i18n_linkCopied = this._translationService.prep('Lien copié !');
	private _i18n_linkCopyFailed = this._translationService.prep('Impossible de copier le lien');

	detailedActivities = input<DetailedActivity[]>([]);
	contributions = input<AnnualContribution[]>([]);
	purchases = input<Purchase[]>([]);
	facilityUsages = input<AnnualFacilityUsage[]>([]);
	contributorCategories = input<Record<string, CategoryEnum | null>>({});
	projectYears = input<number[]>([]);
	project = input<Project | null>(null);
	mainCustomer = input<string>('');
	sponsorCustomer = input<string>('');
	projectManager = input<string>('');
	strategicLead = input<string>('');
	presentationCatalogs = input<ProjectPresentationCatalog[]>([]);
	slideCatalog = input<ProjectPresentationSlideCatalogEntry[]>([]);

	focusMode = model(false);
	selectedPresentationCatalogId = model<string | null>(null);
	presentationCatalogsChange = output<ProjectPresentationCatalog[]>();
	pendingInsertion = signal<PendingSlideInsertion | null>(null);
	selectedCatalogSlideIdToInsert = signal<string>('');
	private _pendingPresentationSlideId = signal<string | null>(null);
	private _pendingPdfExport = signal<false | 'default' | 'with-descriptions'>(false);

	availableBatchOptions = computed<PresentationBatchOption[]>(() => {
		const seen = new Set<string>();
		return this.detailedActivities()
			.map((detailedActivity) => detailedActivity.batch)
			.filter((batch) => {
				if (seen.has(batch.id)) return false;
				seen.add(batch.id);
				return true;
			})
			.map((batch) => {
				const prefix = (batch.prefix ?? '').trim();
				return {
					id: batch.id,
					label: prefix ? `${prefix} · ${batch.title}` : batch.title,
					description: batch.title,
					sortKey: this._buildPrefixSortKey(prefix || batch.title),
				};
			})
			.sort((a, b) => a.sortKey.localeCompare(b.sortKey));
	});

	availableActivityOptions = computed<PresentationActivityOption[]>(() => {
		const selectedBatchIds = new Set(this.selectedPresentationIncludedBatchIds());
		return this.detailedActivities()
			.filter((detailedActivity) => !detailedActivity.activity.hidden)
			.filter((detailedActivity) => selectedBatchIds.size === 0 || selectedBatchIds.has(detailedActivity.batch.id))
			.map((detailedActivity) => ({
				id: detailedActivity.activity.id,
				label: detailedActivity.mergedPrefix || '—',
				title: detailedActivity.activityTitle || 'Activité sans titre',
				batchId: detailedActivity.batch.id,
				sortKey: detailedActivity.mergedPrefixSort || this._buildPrefixSortKey(detailedActivity.mergedPrefix),
			}))
			.sort((a, b) => a.sortKey.localeCompare(b.sortKey));
	});

	private _allActivityOptions = computed<PresentationActivityOption[]>(() =>
		this.detailedActivities()
			.filter((detailedActivity) => !detailedActivity.activity.hidden)
			.map((detailedActivity) => ({
				id: detailedActivity.activity.id,
				label: detailedActivity.mergedPrefix || '—',
				title: detailedActivity.activityTitle || 'Activité sans titre',
				batchId: detailedActivity.batch.id,
				sortKey: detailedActivity.mergedPrefixSort || this._buildPrefixSortKey(detailedActivity.mergedPrefix),
			}))
			.sort((a, b) => a.sortKey.localeCompare(b.sortKey))
	);

	selectedPresentationCatalog = computed<ProjectPresentationCatalog | null>(() => {
		const selectedPresentationCatalogId = this.selectedPresentationCatalogId();
		const presentationCatalogs = this.presentationCatalogs();
		if (presentationCatalogs.length === 0) return null;
		if (selectedPresentationCatalogId === null) return this._normalizePresentationCatalog(presentationCatalogs[0]);
		return this._normalizePresentationCatalog(presentationCatalogs.find((catalog) => catalog.id === selectedPresentationCatalogId) ?? presentationCatalogs[0]);
	});

	selectedPresentationTitle = computed(() => this.selectedPresentationCatalog()?.title ?? '');
	selectedPresentationDescription = computed(() => this.selectedPresentationCatalog()?.description ?? '');
	selectedPresentationSelectedYears = computed(() => this.selectedPresentationCatalog()?.selectedYears ?? []);
	selectedPresentationIncludedBatchIds = computed(() => this.selectedPresentationCatalog()?.includedBatchIds ?? []);
	selectedPresentationIncludedActivityIds = computed(() => this.selectedPresentationCatalog()?.includedActivityIds ?? []);
	selectedPresentationHiddenSlideIds = computed(() => this.selectedPresentationCatalog()?.hiddenSlideIds ?? []);
	selectedPresentationCustomSlides = computed(() => this.selectedPresentationCatalog()?.customSlides ?? []);

	resolvedPresentationActivityIds = computed(() => {
		const selectedBatchIds = new Set(this.selectedPresentationIncludedBatchIds());
		const selectedActivityIds = new Set(this.selectedPresentationIncludedActivityIds());
		const batchFilteredActivityIds =
			selectedBatchIds.size === 0
				? this._allActivityOptions().map((activity) => activity.id)
				: this._allActivityOptions()
						.filter((activity) => selectedBatchIds.has(activity.batchId))
						.map((activity) => activity.id);

		if (selectedActivityIds.size === 0) return batchFilteredActivityIds;
		return batchFilteredActivityIds.filter((activityId) => selectedActivityIds.has(activityId));
	});

	availableAutomaticSlides = computed<PresentationAutomaticSlideOption[]>(() => {
		const includedActivityIds = new Set(this.resolvedPresentationActivityIds());
		return [
			...DEFAULT_PRESENTATION_INTRO_SLIDES,
			...this._allActivityOptions()
				.filter((activity) => includedActivityIds.has(activity.id))
				.map<PresentationAutomaticSlideOption>((activity) => ({
					id: activity.id,
					label: activity.label,
					title: activity.title,
					kind: 'activity',
				})),
			...DEFAULT_PRESENTATION_OUTRO_SLIDES,
		];
	});

	allPossibleAutomaticSlideIds = computed(() => [
		...DEFAULT_PRESENTATION_INTRO_SLIDES.map((slide) => slide.id),
		...this._allActivityOptions().map((activity) => activity.id),
		...DEFAULT_PRESENTATION_OUTRO_SLIDES.map((slide) => slide.id),
	]);

	defaultAutomaticSlideIds = computed(() => this.availableAutomaticSlides().map((slide) => slide.id));

	selectedPresentationOrderedSlideIds = computed(() => this.selectedPresentationCatalog()?.orderedSlideIds ?? this.defaultAutomaticSlideIds());
	selectedPresentationIncludedSlideIds = computed(() => {
		const selectedPresentationCatalog = this.selectedPresentationCatalog();
		if (!selectedPresentationCatalog) return this.defaultAutomaticSlideIds();
		if (selectedPresentationCatalog.includedSlideIds === undefined) return this.defaultAutomaticSlideIds();
		return selectedPresentationCatalog.includedSlideIds;
	});
	removedAutomaticSlides = computed(() => {
		const includedSlideIds = new Set(this.selectedPresentationIncludedSlideIds());
		return this.availableAutomaticSlides().filter((slide) => !includedSlideIds.has(slide.id));
	});

	slideCatalogOptions = computed(() =>
		this.slideCatalog().map((slide) => ({
			id: slide.id,
			label: slide.label,
			title: slide.title,
		}))
	);

	presentationSlideRows = computed<PresentationSlideRow[]>(() => {
		const includedSlideIds = new Set(this.selectedPresentationIncludedSlideIds());
		const hiddenSlideIds = new Set(this.selectedPresentationHiddenSlideIds());
		const baseSlides = this.selectedPresentationOrderedSlideIds()
			.map((slideId) => this.availableAutomaticSlides().find((slide) => slide.id === slideId))
			.filter((slide): slide is PresentationAutomaticSlideOption => slide !== undefined && includedSlideIds.has(slide.id))
			.map<PresentationSlideRow>((slide) => ({
				id: slide.id,
				label: slide.label,
				title: slide.title,
				kind: 'automatic',
				hiddenInFocusMode: hiddenSlideIds.has(slide.id),
			}));

		return this._insertCustomSlides(baseSlides, this.selectedPresentationCustomSlides(), hiddenSlideIds);
	});
	visiblePresentationSlideCount = computed(() => this.presentationSlideRows().filter((slide) => !slide.hiddenInFocusMode).length);
	hiddenPresentationSlideCount = computed(() => this.presentationSlideRows().filter((slide) => slide.hiddenInFocusMode).length);
	syncablePresentationSlideCount = computed(() => this.selectedPresentationCustomSlides().filter((slide) => !!slide.catalogSlideId).length);

	presentationYearOptions = computed(() => this.projectYears().length > 0 ? this.projectYears() : this._deriveAvailableYears());
	resolvedPresentationYears = computed(() => {
		const selectedYears = this.selectedPresentationSelectedYears();
		return selectedYears.length > 0 ? selectedYears : this.presentationYearOptions();
	});
	resolvedPresentationSelectedYear = computed(() => {
		const years = this.resolvedPresentationYears();
		return years.length === 1 ? years[0] : null;
	});

	canInsertCatalogSlide = computed(() => this.pendingInsertion() !== null && this.selectedCatalogSlideIdToInsert().length > 0);
	renderPresentationHost = computed(() => this.focusMode() || this._pendingPdfExport() !== false);

	constructor() {
		effect(() => {
			const presentationCatalogs = this.presentationCatalogs();
			const selectedPresentationCatalogId = this.selectedPresentationCatalogId();
			if (presentationCatalogs.length === 0) {
				this.selectedPresentationCatalogId.set(null);
				return;
			}
			if (selectedPresentationCatalogId && presentationCatalogs.some((catalog) => catalog.id === selectedPresentationCatalogId)) return;
			this.selectedPresentationCatalogId.set(presentationCatalogs[0].id);
		});

		effect(() => {
			const availableActivityIds = new Set(this.availableActivityOptions().map((activity) => activity.id));
			const selectedActivityIds = this.selectedPresentationIncludedActivityIds();
			if (selectedActivityIds.length === 0) return;
			if (selectedActivityIds.every((activityId) => availableActivityIds.has(activityId))) return;
			this.updateSelectedPresentationActivityIds(selectedActivityIds.filter((activityId) => availableActivityIds.has(activityId)));
		});

		effect(() => {
			const child = this._projectPresentationTab();
			const pendingPdfExport = this._pendingPdfExport();
			if (!child || pendingPdfExport === false) return;

			queueMicrotask(() => {
				child.exportPresentationToPdf(pendingPdfExport === 'with-descriptions');
				this._pendingPdfExport.set(false);
			});
		});

		effect((onCleanup) => {
			const child = this._projectPresentationTab();
			const pendingPresentationSlideId = this._pendingPresentationSlideId();
			if (!child || !this.focusMode() || !pendingPresentationSlideId) return;

			const immediateAttempt = window.setTimeout(() => child.scrollToSlide(pendingPresentationSlideId), 0);
			const settledAttempt = window.setTimeout(() => {
				child.scrollToSlide(pendingPresentationSlideId);
				this._pendingPresentationSlideId.set(null);
			}, 220);

			onCleanup(() => {
				window.clearTimeout(immediateAttempt);
				window.clearTimeout(settledAttempt);
			});
		});
	}

	selectPresentationCatalog(presentationCatalogId: string) {
		this.selectedPresentationCatalogId.set(presentationCatalogId);
		this.pendingInsertion.set(null);
		this.selectedCatalogSlideIdToInsert.set('');
	}

	addPresentationCatalog() {
		const automaticSlideIds = this.defaultAutomaticSlideIds();
		const nextPresentationCatalog: ProjectPresentationCatalog = {
			id: crypto.randomUUID(),
			title: 'Nouvelle présentation',
			description: '',
			selectedYears: [],
			includedBatchIds: [],
			includedActivityIds: [],
			orderedSlideIds: automaticSlideIds,
			includedSlideIds: automaticSlideIds,
			hiddenSlideIds: [],
			customSlides: [],
		};
		this._commitPresentationCatalogs([...this.presentationCatalogs(), nextPresentationCatalog], nextPresentationCatalog.id);
	}

	duplicateSelectedPresentationCatalog() {
		const selectedPresentationCatalog = this.selectedPresentationCatalog();
		if (!selectedPresentationCatalog) return;
		const duplicatedPresentationCatalog: ProjectPresentationCatalog = {
			...this._clonePresentationCatalog(selectedPresentationCatalog),
			id: crypto.randomUUID(),
			title: `${selectedPresentationCatalog.title} (copie)`,
		};
		this._commitPresentationCatalogs([...this.presentationCatalogs(), duplicatedPresentationCatalog], duplicatedPresentationCatalog.id);
	}

	deleteSelectedPresentationCatalog() {
		const selectedPresentationCatalog = this.selectedPresentationCatalog();
		if (!selectedPresentationCatalog) return;
		this._notificationService
			.confirm(`${this._i18n_deletePresentationMessage()}\n\n${selectedPresentationCatalog.title}`, this._i18n_deletePresentationTitle(), {
				confirmButtonText: this._i18n_deletePresentationConfirm(),
			})
			.closed.subscribe((confirmed) => {
				if (!confirmed) return;
				const remainingPresentationCatalogs = this.presentationCatalogs().filter((catalog) => catalog.id !== selectedPresentationCatalog.id);
				this._commitPresentationCatalogs(remainingPresentationCatalogs, remainingPresentationCatalogs[0]?.id ?? null);
			});
	}

	updateSelectedPresentationTitle(title: string) {
		this._updateSelectedPresentationCatalog((catalog) => ({ ...catalog, title }));
	}

	updateSelectedPresentationDescription(description: string) {
		this._updateSelectedPresentationCatalog((catalog) => ({ ...catalog, description }));
	}

	updateSelectedPresentationYearsFromEvent(event: Event) {
		const selectedYears = this._readNumericMultiSelectValues(event);
		this._updateSelectedPresentationCatalog((catalog) => ({ ...catalog, selectedYears }));
	}

	updateSelectedPresentationBatchIdsFromEvent(event: Event) {
		const includedBatchIds = this._readStringMultiSelectValues(event);
		this._updateSelectedPresentationCatalog((catalog) => ({ ...catalog, includedBatchIds }));
	}

	updateSelectedPresentationActivityIdsFromEvent(event: Event) {
		this.updateSelectedPresentationActivityIds(this._readStringMultiSelectValues(event));
	}

	updateSelectedPresentationActivityIds(includedActivityIds: string[]) {
		this._updateSelectedPresentationCatalog((catalog) => ({
			...catalog,
			includedActivityIds,
		}));
	}

	updateSlideHiddenInFocusMode(slideId: string, hiddenInFocusMode: boolean) {
		this._updateSelectedPresentationCatalog((catalog) => {
			const hiddenSlideIds = new Set(catalog.hiddenSlideIds ?? []);
			if (hiddenInFocusMode) hiddenSlideIds.add(slideId);
			else hiddenSlideIds.delete(slideId);
			return {
				...catalog,
				hiddenSlideIds: [...hiddenSlideIds],
			};
		});
	}

	syncSlideFromCatalog(slideId: string) {
		this._updateSelectedPresentationCatalog((catalog) => ({
			...catalog,
			customSlides: (catalog.customSlides ?? []).map((customSlide) => {
				if (customSlide.id !== slideId || !customSlide.catalogSlideId) return customSlide;
				const catalogSlide = this.slideCatalog().find((slide) => slide.id === customSlide.catalogSlideId);
				if (!catalogSlide) return customSlide;
				return {
					...customSlide,
					label: catalogSlide.label,
					title: catalogSlide.title,
					subtitle: catalogSlide.subtitle,
					bodyHtml: catalogSlide.bodyHtml,
					bodyLines: [...(catalogSlide.bodyLines ?? [])],
					includeInToc: catalogSlide.includeInToc ?? true,
					showNumber: catalogSlide.showNumber ?? true,
				};
			}),
		}));
	}

	syncAllSlidesFromCatalog() {
		this._updateSelectedPresentationCatalog((catalog) => ({
			...catalog,
			customSlides: (catalog.customSlides ?? []).map((customSlide) => {
				if (!customSlide.catalogSlideId) return customSlide;
				const catalogSlide = this.slideCatalog().find((slide) => slide.id === customSlide.catalogSlideId);
				if (!catalogSlide) return customSlide;
				return {
					...customSlide,
					label: catalogSlide.label,
					title: catalogSlide.title,
					subtitle: catalogSlide.subtitle,
					bodyHtml: catalogSlide.bodyHtml,
					bodyLines: [...(catalogSlide.bodyLines ?? [])],
					includeInToc: catalogSlide.includeInToc ?? true,
					showNumber: catalogSlide.showNumber ?? true,
				};
			}),
		}));
	}

	removeSlide(slideId: string) {
		const automaticSlide = this.availableAutomaticSlides().find((slide) => slide.id === slideId);
		if (automaticSlide) {
			this._updateSelectedPresentationCatalog((catalog) => ({
				...catalog,
				includedSlideIds: (catalog.includedSlideIds ?? []).filter((includedSlideId) => includedSlideId !== slideId),
				orderedSlideIds: (catalog.orderedSlideIds ?? []).filter((orderedSlideId) => orderedSlideId !== slideId),
				hiddenSlideIds: (catalog.hiddenSlideIds ?? []).filter((hiddenSlideId) => hiddenSlideId !== slideId),
			}));
			return;
		}

		this._updateSelectedPresentationCatalog((catalog) => ({
			...catalog,
			hiddenSlideIds: (catalog.hiddenSlideIds ?? []).filter((hiddenSlideId) => hiddenSlideId !== slideId),
			customSlides: (catalog.customSlides ?? []).filter((customSlide) => customSlide.id !== slideId),
		}));
	}

	restoreAutomaticSlide(slideId: string) {
		const automaticSlideIds = this.defaultAutomaticSlideIds();
		this._updateSelectedPresentationCatalog((catalog) => ({
			...catalog,
			includedSlideIds: [...new Set([...(catalog.includedSlideIds ?? []), slideId])],
			orderedSlideIds: this._restoreAutomaticSlideOrder(catalog.orderedSlideIds ?? [], slideId, automaticSlideIds),
		}));
	}

	startInsertion(anchorSlideId: string, position: 'above' | 'below') {
		this.pendingInsertion.set({ anchorSlideId, position });
		this.selectedCatalogSlideIdToInsert.set(this.slideCatalog()[0]?.id ?? '');
	}

	startInsertionIntoEmptyPresentation() {
		this.pendingInsertion.set({ anchorSlideId: null, position: 'below' });
		this.selectedCatalogSlideIdToInsert.set(this.slideCatalog()[0]?.id ?? '');
	}

	cancelInsertion() {
		this.pendingInsertion.set(null);
		this.selectedCatalogSlideIdToInsert.set('');
	}

	updateSelectedCatalogSlideToInsert(catalogSlideId: string) {
		this.selectedCatalogSlideIdToInsert.set(catalogSlideId);
	}

	confirmInsertion() {
		const pendingInsertion = this.pendingInsertion();
		const selectedCatalogSlideId = this.selectedCatalogSlideIdToInsert();
		if (!pendingInsertion || !selectedCatalogSlideId) return;

		const catalogSlide = this.slideCatalog().find((slide) => slide.id === selectedCatalogSlideId);
		if (!catalogSlide) return;

		const insertedSlide: ProjectPresentationCustomSlide = {
			id: crypto.randomUUID(),
			catalogSlideId: catalogSlide.id,
			label: catalogSlide.label,
			title: catalogSlide.title,
			subtitle: catalogSlide.subtitle,
			bodyHtml: catalogSlide.bodyHtml,
			bodyLines: [...(catalogSlide.bodyLines ?? [])],
			includeInToc: catalogSlide.includeInToc ?? true,
			showNumber: catalogSlide.showNumber ?? true,
			beforeSlideId: pendingInsertion.position === 'above' ? pendingInsertion.anchorSlideId ?? undefined : undefined,
			afterSlideId: pendingInsertion.position === 'below' ? pendingInsertion.anchorSlideId ?? undefined : undefined,
		};

		this._updateSelectedPresentationCatalog((catalog) => ({
			...catalog,
			customSlides: [...(catalog.customSlides ?? []), insertedSlide],
		}));
		this.cancelInsertion();
	}

	startPresentation() {
		this._pendingPresentationSlideId.set(null);
		this.focusMode.set(true);
	}

	startPresentationAtSlide(slideId: string) {
		this._pendingPresentationSlideId.set(slideId);
		this.focusMode.set(true);
	}

	exportPdf() {
		this._pendingPdfExport.set('default');
	}

	exportPdfWithDescriptions() {
		this._pendingPdfExport.set('with-descriptions');
	}

	scrollToSlide(id: string) {
		this._projectPresentationTab()?.scrollToSlide(id);
	}

	scrollToUpdate(updateId: string, activityId: string | null = null) {
		this._projectPresentationTab()?.scrollToUpdate(updateId, activityId);
	}

	private _updateSelectedPresentationCatalog(updater: (catalog: ProjectPresentationCatalog) => ProjectPresentationCatalog) {
		const selectedPresentationCatalog = this.selectedPresentationCatalog();
		if (!selectedPresentationCatalog) return;

		const nextPresentationCatalogs = this.presentationCatalogs().map((catalog) =>
			catalog.id === selectedPresentationCatalog.id ? this._normalizePresentationCatalog(updater(this._clonePresentationCatalog(catalog))) : this._normalizePresentationCatalog(this._clonePresentationCatalog(catalog))
		);
		this._commitPresentationCatalogs(nextPresentationCatalogs, selectedPresentationCatalog.id);
	}

	private _commitPresentationCatalogs(nextPresentationCatalogs: ProjectPresentationCatalog[], nextSelectedPresentationCatalogId: string | null) {
		const normalizedPresentationCatalogs = nextPresentationCatalogs.map((catalog) => this._normalizePresentationCatalog(catalog));
		this.presentationCatalogsChange.emit(normalizedPresentationCatalogs);
		this.selectedPresentationCatalogId.set(nextSelectedPresentationCatalogId);
	}

	private _normalizePresentationCatalog(presentationCatalog: ProjectPresentationCatalog): ProjectPresentationCatalog {
		const allPossibleAutomaticSlideIds = this.allPossibleAutomaticSlideIds();
		const validAutomaticSlideIds = allPossibleAutomaticSlideIds.filter((slideId, index) => allPossibleAutomaticSlideIds.indexOf(slideId) === index);
		const requestedIncludedSlideIds = presentationCatalog.includedSlideIds === undefined ? validAutomaticSlideIds : presentationCatalog.includedSlideIds;
		const includedSlideIds = requestedIncludedSlideIds.filter((slideId, index) => validAutomaticSlideIds.includes(slideId) && requestedIncludedSlideIds.indexOf(slideId) === index);
		const orderedSlideIds = [
			...(presentationCatalog.orderedSlideIds ?? []).filter((slideId, index, ids) => includedSlideIds.includes(slideId) && ids.indexOf(slideId) === index),
			...includedSlideIds.filter((slideId) => !(presentationCatalog.orderedSlideIds ?? []).includes(slideId)),
		];

		const validYears = this.presentationYearOptions();
		const selectedYears = [...new Set((presentationCatalog.selectedYears ?? []).filter((year) => validYears.includes(year)))].sort((a, b) => a - b);
		const validBatchIds = new Set(this.availableBatchOptions().map((batch) => batch.id));
		const includedBatchIds = [...new Set((presentationCatalog.includedBatchIds ?? []).filter((batchId) => validBatchIds.has(batchId)))];
		const validActivityIds = new Set(this._allActivityOptions().map((activity) => activity.id));
		const includedActivityIds = [...new Set((presentationCatalog.includedActivityIds ?? []).filter((activityId) => validActivityIds.has(activityId)))];
		const visibleSlideIds = new Set([
			...includedSlideIds,
			...(presentationCatalog.customSlides ?? []).map((customSlide) => customSlide.id),
		]);
		const hiddenSlideIds = [...new Set((presentationCatalog.hiddenSlideIds ?? []).filter((slideId) => visibleSlideIds.has(slideId)))];

		return {
			...this._clonePresentationCatalog(presentationCatalog),
			selectedYears,
			includedBatchIds,
			includedActivityIds,
			includedSlideIds,
			orderedSlideIds,
			hiddenSlideIds,
			customSlides: (presentationCatalog.customSlides ?? []).map((customSlide) => this._cloneCustomSlide(customSlide)),
		};
	}

	private _clonePresentationCatalog(presentationCatalog: ProjectPresentationCatalog): ProjectPresentationCatalog {
		return {
			...presentationCatalog,
			selectedYears: [...(presentationCatalog.selectedYears ?? [])],
			includedBatchIds: [...(presentationCatalog.includedBatchIds ?? [])],
			includedActivityIds: [...(presentationCatalog.includedActivityIds ?? [])],
			orderedSlideIds: [...(presentationCatalog.orderedSlideIds ?? [])],
			includedSlideIds: [...(presentationCatalog.includedSlideIds ?? [])],
			hiddenSlideIds: [...(presentationCatalog.hiddenSlideIds ?? [])],
			customSlides: (presentationCatalog.customSlides ?? []).map((customSlide) => this._cloneCustomSlide(customSlide)),
		};
	}

	private _cloneCustomSlide(customSlide: ProjectPresentationCustomSlide): ProjectPresentationCustomSlide {
		return {
			...customSlide,
			bodyHtml: customSlide.bodyHtml ?? '',
			bodyLines: [...(customSlide.bodyLines ?? [])],
		};
	}

	private _insertCustomSlides(baseSlides: PresentationSlideRow[], customSlides: ProjectPresentationCustomSlide[], hiddenSlideIds: Set<string>) {
		const slides = [...baseSlides];
		for (const customSlide of customSlides) {
			const row: PresentationSlideRow = {
				id: customSlide.id,
				label: customSlide.label,
				title: customSlide.title,
				kind: 'catalog-slide',
				catalogSlideId: customSlide.catalogSlideId,
				hiddenInFocusMode: hiddenSlideIds.has(customSlide.id),
			};
			const beforeSlideId = customSlide.beforeSlideId;
			if (beforeSlideId) {
				const beforeIndex = slides.findIndex((slide) => slide.id === beforeSlideId);
				if (beforeIndex >= 0) {
					slides.splice(beforeIndex, 0, row);
					continue;
				}
			}
			const afterSlideId = customSlide.afterSlideId;
			if (afterSlideId) {
				const afterIndex = slides.findIndex((slide) => slide.id === afterSlideId);
				if (afterIndex >= 0) {
					slides.splice(afterIndex + 1, 0, row);
					continue;
				}
			}
			slides.push(row);
		}
		return slides;
	}

	private _restoreAutomaticSlideOrder(currentOrderedSlideIds: string[], slideId: string, automaticSlideIds: string[]) {
		if (currentOrderedSlideIds.includes(slideId)) return currentOrderedSlideIds;
		const nextOrderedSlideIds = [...currentOrderedSlideIds];
		const targetIndex = automaticSlideIds.indexOf(slideId);
		if (targetIndex < 0) return nextOrderedSlideIds;

		let insertIndex = nextOrderedSlideIds.length;
		for (let index = targetIndex + 1; index < automaticSlideIds.length; index++) {
			const nextAutomaticSlideId = automaticSlideIds[index];
			const existingIndex = nextOrderedSlideIds.indexOf(nextAutomaticSlideId);
			if (existingIndex >= 0) {
				insertIndex = existingIndex;
				break;
			}
		}
		nextOrderedSlideIds.splice(insertIndex, 0, slideId);
		return nextOrderedSlideIds;
	}

	private _deriveAvailableYears() {
		const years = new Set<number>();
		for (const contribution of this.contributions()) years.add(contribution.year);
		for (const purchase of this.purchases()) years.add(purchase.year);
		for (const usage of this.facilityUsages()) years.add(usage.year);
		return [...years].sort((a, b) => a - b);
	}

	private _readStringMultiSelectValues(event: Event) {
		const selectElement = event.target as HTMLSelectElement | null;
		if (!selectElement) return [];
		return Array.from(selectElement.selectedOptions)
			.map((option) => option.value)
			.filter((value) => value.length > 0);
	}

	private _readNumericMultiSelectValues(event: Event) {
		return this._readStringMultiSelectValues(event)
			.map((value) => Number(value))
			.filter((value) => Number.isInteger(value));
	}

	copyPresentationLink() {
		const projectId = this.project()?.id;
		const catalogId = this.selectedPresentationCatalog()?.id;
		if (!projectId || !catalogId) return;

		const url = `${window.location.origin}/p/${projectId}/${catalogId}`;
		navigator.clipboard.writeText(url).then(
			() => this._notificationService.snackSuccess(this._i18n_linkCopied()),
			() => this._notificationService.snackError(this._i18n_linkCopyFailed())
		);
	}

	private _buildPrefixSortKey(prefix?: string) {
		const value = (prefix ?? '').trim();
		if (!value) return 'zzzzzzzz';
		return value.replace(/\d+/g, (digits) => digits.padStart(8, '0')).toLowerCase();
	}
}
