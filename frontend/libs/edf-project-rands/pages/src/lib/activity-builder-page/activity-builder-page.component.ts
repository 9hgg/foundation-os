import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, inject, model, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { AnnualContributionsModals, AnnualFacilityUsagesModals, ContributorsModals, DeliverablesModals, PurchasesModals } from '@edf/edf-project-rands/modals';
import { Activity, ActivityDeliverable, ActivityProposal, ActivityProposalKind, ActivityUpdate, ActivityUpdateLink, AnnualContribution, AnnualFacilityUsage, CategoryEnum, Contributor, Deliverable, Facility, Project, Purchase } from '@edf/edf-project-rands/models';
import { ActivitiesRepository, ActivityDeliverablesRepository, AnnualContributionsRepository, AnnualFacilityUsagesRepository, BatchesRepository, ContributorsRepository, DeliverablesRepository, FacilitiesRepository, ProjectsRepository, PurchasesRepository } from '@edf/edf-project-rands/state';
import { AnnualContributionTableComponent, AnnualFacilityUsageTableComponent, DeliverableTableComponent, PurchaseTableComponent } from '@edf/edf-project-rands/ui';
import { EntityFile } from '@foundation/files/models';
import { FileModals } from '@foundation/files/modals';
import { FilesRepository } from '@foundation/files/state';
import { FileThumbnailComponent, UploadButtonComponent } from '@foundation/files/ui';
import { RequestService } from '@foundation/network/services';
import { NotificationService } from '@foundation/notification';
import { QuillTextareaComponent } from '@foundation/quill/ui';
import { TranslateDirective, TranslationService } from '@foundation/translations/services';
import { PatchableItem, Selector } from '@foundation/utils';
import { combineLatest, map, of, startWith, Subject, switchMap, take, tap } from 'rxjs';
import { v4 as uuidv4 } from 'uuid';
import { ProjectCostService } from '../project-builder-page/project-cost.service';

interface ActivityReportSection {
	heading: string;
	paragraphs?: string[];
	bullets?: string[];
	table?: ActivityReportTable;
}

interface ActivityReportTable {
	headers: string[];
	rows: string[][];
}

interface ActivityReportData {
	projectYears: number[];
	contributions: AnnualContribution[];
	facilityUsages: AnnualFacilityUsage[];
	purchases: Purchase[];
	contributorCategories: Record<string, CategoryEnum | null>;
}

interface ActivityUpdateView extends ActivityUpdate {
	dateInput: string;
	files: EntityFile[];
	sourceKindLabel: string;
}

interface ActivityProposalView extends ActivityProposal {
	dateInput: string;
	kindLabel: string;
	files: EntityFile[];
}

@Component({
	selector: 'lib-activity-builder-page',
	standalone: true,
	imports: [CommonModule, FormsModule, TranslateDirective, RouterModule, QuillTextareaComponent, PurchaseTableComponent, AnnualContributionTableComponent, AnnualFacilityUsageTableComponent, DeliverableTableComponent, FileThumbnailComponent, UploadButtonComponent],
	templateUrl: './activity-builder-page.component.html',
	styleUrls: ['./activity-builder-page.component.css'],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ActivityBuilderPageComponent {
	private _route = inject(ActivatedRoute);
	public readonly activityUpdateSourceKinds: { value: string; label: string }[] = [
		{ value: 'project', label: 'Projet' },
		{ value: 'contributor', label: 'Contributeur' },
		{ value: 'customer', label: 'Client' },
		{ value: 'other', label: 'Autre' },
	];
	public readonly activityProposalKinds: { value: ActivityProposalKind; label: string }[] = [
		{ value: 'inflexion', label: 'Inflexion' },
		{ value: 'question', label: 'Question' },
		{ value: 'proposal', label: 'Proposition' },
	];
	public notificationService = inject(NotificationService);
	private _activitiesRepository = inject(ActivitiesRepository);
	private _projectCostService = inject(ProjectCostService);
	private _fileModals = inject(FileModals);
	private _filesRepository = inject(FilesRepository);
	private _requestService = inject(RequestService);
	private _annualContributionsRepository = inject(AnnualContributionsRepository);
	private _annualFacilityUsagesRepository = inject(AnnualFacilityUsagesRepository);
	private _purchasesRepository = inject(PurchasesRepository);
	private _deliverablesRepository = inject(DeliverablesRepository);
	private _activityDeliverablesRepository = inject(ActivityDeliverablesRepository);
	private _contributorsRepository = inject(ContributorsRepository);
	private _facilitiesRepository = inject(FacilitiesRepository);
	private _batchesRepository = inject(BatchesRepository);
	private _projectsRepository = inject(ProjectsRepository);
	private _annualContributionsModals = inject(AnnualContributionsModals);
	private _annualFacilityUsagesModals = inject(AnnualFacilityUsagesModals);
	private _purchasesModals = inject(PurchasesModals);
	private _deliverablesModals = inject(DeliverablesModals);
	private _contributorsModals = inject(ContributorsModals);
	private _translationService = inject(TranslationService);
	private _i18n_removeContributionConfirm = this._translationService.prep('Are you sure you want to remove this contribution?');
	private _i18n_removeFacilityUsageConfirm = this._translationService.prep('Are you sure you want to remove this facility usage?');
	private _i18n_removeDeliverableConfirm = this._translationService.prep('Are you sure you want to detach this deliverable?');
	private _i18n_removeActivityUpdateConfirm = this._translationService.prep('Are you sure you want to remove this update?');
	private _i18n_removeActivityUpdateTitle = this._translationService.prep('Remove update');
	private _i18n_removeActivityUpdateButton = this._translationService.prep('Remove');
	private _i18n_removeActivityProposalConfirm = this._translationService.prep('Are you sure you want to remove this proposal?');
	private _i18n_removeActivityProposalTitle = this._translationService.prep('Remove proposal');
	private _i18n_removeActivityProposalButton = this._translationService.prep('Remove');
	private _i18n_reportTitle = this._translationService.prep('Activity report');
	private _i18n_refreshReport = this._translationService.prep('Refresh');
	public reportTitle = this._i18n_reportTitle;
	public refreshReportLabel = this._i18n_refreshReport;

	public activityId = model<string | null>(null);
	patchableActivity = new PatchableItem<Activity>(
		this.activityId,
		(id) => (id ? this._activitiesRepository.store.getObjectByIdPullOnce$$$(id).$ : of(null)),
		(activityId, patch) =>
			this._activitiesRepository.store.applyPatch(activityId, patch).subscribe(() => {
				this.patchableActivity.item$$$.next(activityId);
			})
	);
	activity = this.patchableActivity.patchedItem;
	activity$$$ = this.patchableActivity.item$$$;
	activityUpdates = computed(() => this.activity()?.config?.updates ?? []);
	activityProposals = computed(() => this.activity()?.config?.proposals ?? []);
	updateExpandedSelector = new Selector<string>();
	proposalExpandedSelector = new Selector<string>();
	updateFilesByUpdateId = signal<Record<string, EntityFile[]>>({});
	proposalFilesByProposalId = signal<Record<string, EntityFile[]>>({});
	targetUpdateId = signal<string | null>(null);
	targetProposalId = signal<string | null>(null);
	highlightedUpdateId = signal<string | null>(null);
	highlightedProposalId = signal<string | null>(null);
	activityUpdatesView = computed<ActivityUpdateView[]>(() =>
		this.activityUpdates().map((update) => ({
			...update,
			dateInput: this._toLocalDateTimeInputValue(update.date),
			files: this.updateFilesByUpdateId()[update.id] ?? [],
			sourceKindLabel: this._formatUpdateSourceKind(update.sourceKind),
		}))
	);
	activityProposalsView = computed<ActivityProposalView[]>(() =>
		this.activityProposals().map((proposal) => ({
			...proposal,
			dateInput: this._toLocalDateTimeInputValue(proposal.date),
			kindLabel: this._formatProposalKind(proposal.kind),
			files: this.proposalFilesByProposalId()[proposal.id] ?? [],
		}))
	);

	annualContributions = signal<AnnualContribution[]>([]);
	annualFacilityUsages = signal<AnnualFacilityUsage[]>([]);
	purchases = signal<Purchase[]>([]);
	activityDeliverables = signal<ActivityDeliverable[]>([]);
	deliverables = signal<Deliverable[]>([]);
	contributorNames = signal<Record<string, string>>({});
	contributorCategories = signal<Record<string, CategoryEnum | null>>({});
	facilityNames = signal<Record<string, string>>({});
	project = signal<Project | null>(null);
	projectYears = signal<number[]>([]);

	yearlyBilledCostTable = computed(() => this._buildYearlyBilledCostTable());

	private _updateContributions$ = new Subject<void>();
	private _updateFacilityUsages$ = new Subject<void>();
	private _updatePurchases$ = new Subject<void>();
	private _updateDeliverables$ = new Subject<void>();

	constructor() {
		this._route.paramMap.pipe(takeUntilDestroyed()).subscribe((paramMap) => {
			this.activityId.set(paramMap.get('activityId'));
		});

		this._route.queryParamMap.pipe(takeUntilDestroyed()).subscribe((queryParamMap) => {
			this.targetUpdateId.set(queryParamMap.get('updateId'));
			this.targetProposalId.set(queryParamMap.get('proposalId'));
		});

		this.activity$$$.$.pipe(
			takeUntilDestroyed(),
			switchMap((activity) => {
				if (!activity) {
					this._resetActivityAttachments();
					this.project.set(null);
					this.projectYears.set([]);
					return of({
						activity: null,
						project: null,
						projectYears: [],
						mergedYears: [],
						activities: [],
						contributions: [],
						facilityUsages: [],
						purchases: [],
						deliverableLinks: [],
						deliverables: [],
						facilityNames: {},
						pdfUrl: null,
					});
				}

				const batch$ = this._batchesRepository.store.getObjectByIdPullOnce$$$(activity.batchId).$;
				const project$ = batch$.pipe(
					switchMap((batch) => {
						const projectId = batch?.projectId;
						if (!projectId) return of<Project | null>(null);
						return this._projectsRepository.store.getObjectByIdPullOnce$$$(projectId).$;
					})
				);
				const projectYears$ = project$.pipe(map((project) => this._deriveProjectYears(project)));
				const activities$ = this._requestService
					.getBasic$<{ data: Activity[] }>('/api/edf/rand/activities', {
						filters: `batch_id:${activity.batchId}:exact`,
						page_size: 200,
					})
					.pipe(map((response) => response?.result?.data ?? []));
				const contributions$ = this._updateContributions$.pipe(
					startWith(void 0),
					switchMap(() =>
						this._requestService
							.getBasic$<{ data: AnnualContribution[] }>('/api/edf/rand/annual-contributions', {
								filters: `activity_id:${activity.id}:exact`,
								page_size: 200,
							})
							.pipe(map((response) => response?.result?.data ?? []))
					)
				);
				const facilityUsages$ = this._updateFacilityUsages$.pipe(
					startWith(void 0),
					switchMap(() =>
						this._requestService
							.getBasic$<{ data: AnnualFacilityUsage[] }>('/api/edf/rand/annual-facility-usages', {
								filters: `activity_id:${activity.id}:exact`,
								page_size: 200,
							})
							.pipe(map((response) => response?.result?.data ?? []))
					)
				);
				const purchases$ = this._updatePurchases$.pipe(
					startWith(void 0),
					switchMap(() =>
						this._requestService
							.getBasic$<{ data: Purchase[] }>('/api/edf/rand/purchases', {
								filters: `activity_id:${activity.id}:exact`,
								page_size: 200,
							})
							.pipe(map((response) => response?.result?.data ?? []))
					)
				);
				const deliverableLinks$ = this._updateDeliverables$.pipe(
					startWith(void 0),
					switchMap(() =>
						this._requestService
							.getBasic$<{ data: ActivityDeliverable[] }>('/api/edf/rand/activity-deliverables', {
								filters: `activity_id:${activity.id}:exact`,
								page_size: 200,
							})
							.pipe(map((response) => response?.result?.data ?? []))
					)
				);

				return combineLatest({
					activity: of(activity),
					project: project$,
					projectYears: projectYears$,
					activities: activities$,
					contributions: contributions$,
					facilityUsages: facilityUsages$,
					purchases: purchases$,
					deliverableLinks: deliverableLinks$,
				}).pipe(
					switchMap((data) =>
						combineLatest({
							contributorInfo: this._loadContributorInfo(data.contributions),
							facilityNames: this._loadFacilityInfo(data.facilityUsages),
							deliverables: this._loadDeliverablesForLinks$(data.deliverableLinks),
						}).pipe(
							map(({ facilityNames, deliverables }) => ({
								...data,
								facilityNames,
								mergedYears: this._mergeProjectYearsWithData(data.projectYears, data.contributions, data.facilityUsages, data.purchases),
								deliverables,
							}))
						)
					)
				);
			})
		).subscribe((data) => {
			this.project.set(data.project);
			this.projectYears.set(data.mergedYears ?? data.projectYears);
			this.annualContributions.set(data.contributions);
			this.annualFacilityUsages.set(data.facilityUsages);
			this.purchases.set(data.purchases);
			this.activityDeliverables.set(data.deliverableLinks);
			this.deliverables.set(data.deliverables);
			this.facilityNames.set(data.facilityNames);
		});

		this.activity$$$.$.pipe(
			takeUntilDestroyed(),
			switchMap((activity) => this._loadFilesForUpdates$(activity?.config?.updates ?? []))
		).subscribe((filesByUpdateId) => {
			this.updateFilesByUpdateId.set(filesByUpdateId);
		});

		this.activity$$$.$.pipe(
			takeUntilDestroyed(),
			switchMap((activity) => this._loadFilesForProposals$(activity?.config?.proposals ?? []))
		).subscribe((filesByProposalId) => {
			this.proposalFilesByProposalId.set(filesByProposalId);
		});

		effect((onCleanup) => {
			const targetUpdateId = this.targetUpdateId();
			const updateIds = this.activityUpdates().map((update) => update.id);
			if (!targetUpdateId || !updateIds.includes(targetUpdateId)) return;
			this.updateExpandedSelector.select(targetUpdateId);

			const scrollTimeout = window.setTimeout(() => {
				const updateElement = document.getElementById(`activity-update-${targetUpdateId}`);
				if (!updateElement) return;
				this.highlightedUpdateId.set(targetUpdateId);
				updateElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
			}, 0);

			const clearTimeoutId = window.setTimeout(() => {
				if (this.highlightedUpdateId() === targetUpdateId) {
					this.highlightedUpdateId.set(null);
				}
			}, 4500);

			onCleanup(() => {
				window.clearTimeout(scrollTimeout);
				window.clearTimeout(clearTimeoutId);
			});
		});

		effect((onCleanup) => {
			const targetProposalId = this.targetProposalId();
			const proposalIds = this.activityProposals().map((proposal) => proposal.id);
			if (!targetProposalId || !proposalIds.includes(targetProposalId)) return;
			this.proposalExpandedSelector.select(targetProposalId);

			const scrollTimeout = window.setTimeout(() => {
				const proposalElement = document.getElementById(`activity-proposal-${targetProposalId}`);
				if (!proposalElement) return;
				this.highlightedProposalId.set(targetProposalId);
				proposalElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
			}, 0);

			const clearTimeoutId = window.setTimeout(() => {
				if (this.highlightedProposalId() === targetProposalId) {
					this.highlightedProposalId.set(null);
				}
			}, 4500);

			onCleanup(() => {
				window.clearTimeout(scrollTimeout);
				window.clearTimeout(clearTimeoutId);
			});
		});

		effect(() => {
			const updateIds = new Set(this.activityUpdates().map((update) => update.id));
			for (const selectedUpdateId of this.updateExpandedSelector.selectedItems) {
				if (!updateIds.has(selectedUpdateId)) {
					this.updateExpandedSelector.unselect(selectedUpdateId);
				}
			}
		});
	}

	private _loadFilesForUpdates$(updates: ActivityUpdate[]) {
		const uniqueFileIds = [...new Set(updates.flatMap((update) => update.fileIds ?? []).filter((fileId) => !!fileId))];
		if (uniqueFileIds.length === 0) {
			return of<Record<string, EntityFile[]>>({});
		}

		return combineLatest(
			uniqueFileIds.map((fileId) =>
				this._filesRepository.store.getObjectByIdPullOnce$$$(fileId).$.pipe(
					map((file) => ({ fileId, file }))
				)
			)
		).pipe(
			map((entries) => {
				const filesById: Record<string, EntityFile> = {};
				for (const entry of entries) {
					if (entry.file) {
						filesById[entry.fileId] = entry.file;
					}
				}

				const filesByUpdateId: Record<string, EntityFile[]> = {};
				for (const update of updates) {
					filesByUpdateId[update.id] = (update.fileIds ?? []).map((fileId) => filesById[fileId]).filter((file): file is EntityFile => !!file);
				}
				return filesByUpdateId;
			})
		);
	}

	private _loadFilesForProposals$(proposals: ActivityProposal[]) {
		const uniqueFileIds = [...new Set(proposals.flatMap((proposal) => proposal.fileIds ?? []).filter((fileId) => !!fileId))];
		if (uniqueFileIds.length === 0) {
			return of<Record<string, EntityFile[]>>({});
		}

		return combineLatest(
			uniqueFileIds.map((fileId) =>
				this._filesRepository.store.getObjectByIdPullOnce$$$(fileId).$.pipe(
					map((file) => ({ fileId, file }))
				)
			)
		).pipe(
			map((entries) => {
				const filesById: Record<string, EntityFile> = {};
				for (const entry of entries) {
					if (entry.file) {
						filesById[entry.fileId] = entry.file;
					}
				}

				const filesByProposalId: Record<string, EntityFile[]> = {};
				for (const proposal of proposals) {
					filesByProposalId[proposal.id] = (proposal.fileIds ?? []).map((fileId) => filesById[fileId]).filter((file): file is EntityFile => !!file);
				}
				return filesByProposalId;
			})
		);
	}

	private _toLocalDateTimeInputValue(value?: Date) {
		if (!value) return '';
		const date = new Date(value);
		if (Number.isNaN(date.getTime())) return '';
		const year = date.getFullYear();
		const month = `${date.getMonth() + 1}`.padStart(2, '0');
		const day = `${date.getDate()}`.padStart(2, '0');
		const hours = `${date.getHours()}`.padStart(2, '0');
		const minutes = `${date.getMinutes()}`.padStart(2, '0');
		return `${year}-${month}-${day}T${hours}:${minutes}`;
	}

	private _formatUpdateSourceKind(sourceKind?: string) {
		switch (sourceKind) {
			case 'project':
				return 'Projet';
			case 'contributor':
				return 'Contributeur';
			case 'customer':
				return 'Client';
			case 'other':
				return 'Autre';
			default:
				return sourceKind || 'Autre';
		}
	}

	private _formatProposalKind(kind?: ActivityProposalKind) {
		switch (kind) {
			case 'inflexion':
				return 'Inflexion';
			case 'question':
				return 'Question';
			case 'proposal':
				return 'Proposition';
			default:
				return 'Question';
		}
	}

	private _buildYearlyBilledCostTable(reportData?: ActivityReportData): ActivityReportTable | null {
		const data = reportData ?? {
			projectYears: this._getYearRange(),
			contributions: this.annualContributions(),
			facilityUsages: this.annualFacilityUsages(),
			purchases: this.purchases(),
			contributorCategories: this.contributorCategories(),
		};
		const years = data.projectYears;
		if (years.length === 0) return null;
		const humanTotals = this._initializeYearTotals(years);
		const expenditureTotals = this._initializeYearTotals(years);

		data.contributions.forEach((contribution) => {
			const category = data.contributorCategories[contribution.contributorId] ?? null;
			const billed = this._getContributionBilledAmountKeur(contribution, category);
			if (billed === null) return;
			this._addYearlyTotal(humanTotals, contribution.year, billed);
		});
		data.facilityUsages.forEach((usage) => {
			const billed = this._getFacilityUsageBilledAmountKeur(usage);
			if (billed === null) return;
			this._addYearlyTotal(expenditureTotals, usage.year, billed);
		});
		data.purchases.forEach((purchase) => {
			const billed = this._getPurchaseBilledAmountKeur(purchase);
			if (billed === null) return;
			this._addYearlyTotal(expenditureTotals, purchase.year, billed);
		});

		const totalTotals = new Map<number, number>();
		years.forEach((year) => {
			const total = (humanTotals.get(year) ?? 0) + (expenditureTotals.get(year) ?? 0);
			totalTotals.set(year, total);
		});

		const headers = ['Type', ...years.map((year) => `${year}`), 'Total'];
		const rows = [this._buildYearRow('Human cost', years, humanTotals), this._buildYearRow('Expenditures', years, expenditureTotals), this._buildYearRow('Total', years, totalTotals)];

		return { headers, rows };
	}

	private _addYearlyTotal(totals: Map<number, number>, year: number, amountKeur: number) {
		if (!totals.has(year)) return;
		const current = totals.get(year) ?? 0;
		totals.set(year, current + amountKeur);
	}

	private _initializeYearTotals(years: number[]): Map<number, number> {
		const totals = new Map<number, number>();
		years.forEach((year) => totals.set(year, 0));
		return totals;
	}

	private _buildYearRow(label: string, years: number[], totals: Map<number, number>): string[] {
		const values = years.map((year) => this._formatKeur(totals.get(year) ?? 0) + 'k€');
		const totalValue = this._formatKeur(this._sumTotals(totals, years)) + 'k€';
		return [label, ...values, totalValue];
	}

	private _sumTotals(totals: Map<number, number>, years: number[]): number {
		return years.reduce((sum, year) => sum + (totals.get(year) ?? 0), 0);
	}

	private _getContributionBilledAmountKeur(contribution: AnnualContribution, category: CategoryEnum | null): number | null {
		return this._projectCostService.getContributionBilledAmountKeur(contribution, category);
	}

	private _getFacilityUsageBilledAmountKeur(usage: AnnualFacilityUsage): number | null {
		return this._projectCostService.getFacilityUsageBilledAmountKeur(usage);
	}

	private _getPurchaseBilledAmountKeur(purchase: Purchase): number | null {
		return this._projectCostService.getPurchaseBilledAmountKeur(purchase);
	}

	private _formatKeur(value: number): string {
		return value.toFixed(2).replace(/\.00$/, '');
	}

	private _deriveProjectYears(project: Project | null): number[] {
		if (!project) return [];
		const startYear = this._parseYear(project.startDate);
		const endYear = this._parseYear(project.endDate);
		if (startYear === null && endYear === null) return [];
		const normalizedStart = startYear ?? endYear ?? new Date().getFullYear();
		const normalizedEnd = endYear ?? startYear ?? normalizedStart;
		const minYear = Math.min(normalizedStart, normalizedEnd);
		const maxYear = Math.max(normalizedStart, normalizedEnd);
		return this._buildYearRange(minYear, maxYear);
	}

	private _parseYear(value?: string): number | null {
		if (!value) return null;
		const parsed = new Date(value);
		if (Number.isNaN(parsed.getTime())) return null;
		return parsed.getFullYear();
	}

	private _buildYearRange(startYear: number, endYear: number): number[] {
		const years: number[] = [];
		for (let year = startYear; year <= endYear; year += 1) {
			years.push(year);
		}
		return years;
	}

	private _getYearRange(): number[] {
		const projectYears = this.projectYears();
		const dataYears = this._getYearsFromData();
		if (projectYears.length === 0) {
			return dataYears;
		}
		if (dataYears.length === 0) {
			return projectYears;
		}
		const minYear = Math.min(projectYears[0] ?? 0, dataYears[0] ?? 0);
		const maxYear = Math.max(projectYears[projectYears.length - 1] ?? 0, dataYears[dataYears.length - 1] ?? 0);
		return this._buildYearRange(minYear, maxYear);
	}

	private _mergeProjectYearsWithData(projectYears: number[], contributions: AnnualContribution[], facilityUsages: AnnualFacilityUsage[], purchases: Purchase[]): number[] {
		const dataYears = new Set<number>();
		contributions.forEach((contribution) => dataYears.add(contribution.year));
		facilityUsages.forEach((usage) => dataYears.add(usage.year));
		purchases.forEach((purchase) => dataYears.add(purchase.year));
		const normalizedDataYears = Array.from(dataYears).sort((a, b) => a - b);
		if (projectYears.length === 0) {
			return normalizedDataYears;
		}
		if (normalizedDataYears.length === 0) {
			return projectYears;
		}
		const minYear = Math.min(projectYears[0] ?? 0, normalizedDataYears[0] ?? 0);
		const maxYear = Math.max(projectYears[projectYears.length - 1] ?? 0, normalizedDataYears[normalizedDataYears.length - 1] ?? 0);
		return this._buildYearRange(minYear, maxYear);
	}

	private _getYearsFromData(): number[] {
		const years = new Set<number>();
		this.annualContributions().forEach((contribution) => years.add(contribution.year));
		this.annualFacilityUsages().forEach((usage) => years.add(usage.year));
		this.purchases().forEach((purchase) => years.add(purchase.year));
		return Array.from(years).sort((a, b) => a - b);
	}

	private _splitParagraphs(value?: string): string[] {
		if (!value) return [];
		return value
			.split(/\r?\n/)
			.map((line) => line.trim())
			.filter((line) => line.length > 0);
	}

	addActivityUpdate() {
		const updates: ActivityUpdate[] = [
			...this.activityUpdates(),
			{
				id: uuidv4(),
				date: new Date(),
				sourceKind: 'other',
				sourceName: '',
				fileIds: [],
				links: [],
				title: '',
				content: '',
			},
		];
		const createdUpdateId = updates[updates.length - 1]?.id;
		if (createdUpdateId) {
			this.updateExpandedSelector.select(createdUpdateId);
		}
		this.patchableActivity.updateField('config.updates', updates);
	}

	updateActivityUpdateDate(updateId: string, value: string) {
		const nextDate = value ? new Date(value) : undefined;
		const updates = this.activityUpdates().map((update) => {
			if (update.id !== updateId) return update;
			return {
				...update,
				date: nextDate,
			};
		});
		this.patchableActivity.updateField('config.updates', updates);
	}

	updateActivityUpdateField(updateId: string, field: keyof ActivityUpdate, value: string) {
		const updates = this.activityUpdates().map((update) => {
			if (update.id !== updateId) return update;
			return {
				...update,
				[field]: value,
			};
		});
		this.patchableActivity.updateField('config.updates', updates);
	}

	addFilesToActivityUpdate(updateId: string) {
		this._fileModals
			.openFilesSelectionDialog({
				selectionConstraints: { single: false, maxFiles: 24, minFiles: 1 },
			})
			.closed.subscribe((result) => {
				const selectedFileIds = result?.files?.map((file) => file.id) ?? [];
				if (selectedFileIds.length === 0) return;
				const updates = this.activityUpdates().map((update) => {
					if (update.id !== updateId) return update;
					return {
						...update,
						fileIds: [...new Set([...(update.fileIds ?? []), ...selectedFileIds])],
					};
				});
				this.patchableActivity.updateField('config.updates', updates);
			});
	}

	processUploadedFilesForActivityUpdate(updateId: string, files: (EntityFile | undefined)[]) {
		const uploadedFileIds = files.filter((file): file is EntityFile => !!file).map((file) => file.id);
		if (uploadedFileIds.length === 0) return;
		const updates = this.activityUpdates().map((update) => {
			if (update.id !== updateId) return update;
			return {
				...update,
				fileIds: [...new Set([...(update.fileIds ?? []), ...uploadedFileIds])],
			};
		});
		this.patchableActivity.updateField('config.updates', updates);
	}

	addFilesToActivityProposal(proposalId: string) {
		this._fileModals
			.openFilesSelectionDialog({
				selectionConstraints: { single: false, maxFiles: 24, minFiles: 1 },
			})
			.closed.subscribe((result) => {
				const selectedFileIds = result?.files?.map((file) => file.id) ?? [];
				if (selectedFileIds.length === 0) return;
				const proposals = this.activityProposals().map((proposal) => {
					if (proposal.id !== proposalId) return proposal;
					return {
						...proposal,
						fileIds: [...new Set([...(proposal.fileIds ?? []), ...selectedFileIds])],
					};
				});
				this.patchableActivity.updateField('config.proposals', proposals);
			});
	}

	processUploadedFilesForActivityProposal(proposalId: string, files: (EntityFile | undefined)[]) {
		const uploadedFileIds = files.filter((file): file is EntityFile => !!file).map((file) => file.id);
		if (uploadedFileIds.length === 0) return;
		const proposals = this.activityProposals().map((proposal) => {
			if (proposal.id !== proposalId) return proposal;
			return {
				...proposal,
				fileIds: [...new Set([...(proposal.fileIds ?? []), ...uploadedFileIds])],
			};
		});
		this.patchableActivity.updateField('config.proposals', proposals);
	}

	removeActivityProposalFile(proposalId: string, fileId: string) {
		const proposals = this.activityProposals().map((proposal) => {
			if (proposal.id !== proposalId) return proposal;
			return {
				...proposal,
				fileIds: (proposal.fileIds ?? []).filter((currentFileId) => currentFileId !== fileId),
			};
		});
		this.patchableActivity.updateField('config.proposals', proposals);
	}

	openActivityProposalFile(file: EntityFile) {
		this._fileModals.openEntityFileDisplayDialog(file);
	}

	removeActivityUpdateFile(updateId: string, fileId: string) {
		const updates = this.activityUpdates().map((update) => {
			if (update.id !== updateId) return update;
			return {
				...update,
				fileIds: (update.fileIds ?? []).filter((currentFileId) => currentFileId !== fileId),
			};
		});
		this.patchableActivity.updateField('config.updates', updates);
	}

	openActivityUpdateFile(file: EntityFile) {
		this._fileModals.openEntityFileDisplayDialog(file);
	}

	goToPresentation() {
		const activity = this.activity();
		const project = this.project();
		if (!activity || !project) return;
		this._projectsRepository.goToProject(project.id, {
			activeTab: 'presentation',
			selectedBatchId: activity.batchId,
			presentationActivityId: activity.id,
		});
	}

	goToPresentationUpdate(updateId: string) {
		const activity = this.activity();
		const project = this.project();
		if (!activity || !project) return;
		this._projectsRepository.goToProject(project.id, {
			activeTab: 'presentation',
			selectedBatchId: activity.batchId,
			presentationActivityId: activity.id,
			presentationUpdateId: updateId,
		});
	}

	goToPresentationProposal(proposalId: string) {
		const activity = this.activity();
		const project = this.project();
		if (!activity || !project) return;
		this._projectsRepository.goToProject(project.id, {
			activeTab: 'presentation',
			selectedBatchId: activity.batchId,
			presentationActivityId: activity.id,
			presentationProposalId: proposalId,
		});
	}

	addActivityUpdateLink(updateId: string) {
		const updates = this.activityUpdates().map((update) => {
			if (update.id !== updateId) return update;
			return {
				...update,
				links: [...(update.links ?? []), { title: '', url: '' }],
			};
		});
		this.patchableActivity.updateField('config.updates', updates);
	}

	updateActivityUpdateLink(updateId: string, index: number, field: keyof ActivityUpdateLink, value: string) {
		const updates = this.activityUpdates().map((update) => {
			if (update.id !== updateId) return update;
			const links = [...(update.links ?? [])];
			const currentLink = links[index] ?? { title: '', url: '' };
			links[index] = {
				...currentLink,
				[field]: value,
			};
			return {
				...update,
				links,
			};
		});
		this.patchableActivity.updateField('config.updates', updates);
	}

	removeActivityUpdateLink(updateId: string, index: number) {
		const updates = this.activityUpdates().map((update) => {
			if (update.id !== updateId) return update;
			return {
				...update,
				links: (update.links ?? []).filter((_, currentIndex) => currentIndex !== index),
			};
		});
		this.patchableActivity.updateField('config.updates', updates);
	}

	removeActivityUpdate(updateId: string) {
		this.notificationService
			.confirm(this._i18n_removeActivityUpdateConfirm(), this._i18n_removeActivityUpdateTitle(), {
				confirmButtonText: this._i18n_removeActivityUpdateButton(),
			})
			.closed.subscribe((confirmed) => {
				if (!confirmed) return;
				const updates = this.activityUpdates().filter((update) => update.id !== updateId);
				this.patchableActivity.updateField('config.updates', updates);
			});
	}

	addActivityProposal() {
		const proposals: ActivityProposal[] = [
			...this.activityProposals(),
			{
				id: uuidv4(),
				kind: 'question',
				date: new Date(),
				title: '',
				content: '',
				answerContent: '',
				fileIds: [],
				links: [],
			},
		];
		const createdProposalId = proposals[proposals.length - 1]?.id;
		if (createdProposalId) {
			this.proposalExpandedSelector.select(createdProposalId);
		}
		this.patchableActivity.updateField('config.proposals', proposals);
	}

	updateActivityProposalDate(proposalId: string, value: string) {
		const nextDate = value ? new Date(value) : undefined;
		const proposals = this.activityProposals().map((proposal) => {
			if (proposal.id !== proposalId) return proposal;
			return {
				...proposal,
				date: nextDate,
			};
		});
		this.patchableActivity.updateField('config.proposals', proposals);
	}

	updateActivityProposalField(proposalId: string, field: keyof ActivityProposal, value: string) {
		const proposals = this.activityProposals().map((proposal) => {
			if (proposal.id !== proposalId) return proposal;
			return {
				...proposal,
				[field]: value,
			};
		});
		this.patchableActivity.updateField('config.proposals', proposals);
	}

	addActivityProposalLink(proposalId: string) {
		const proposals = this.activityProposals().map((proposal) => {
			if (proposal.id !== proposalId) return proposal;
			return {
				...proposal,
				links: [...(proposal.links ?? []), { title: '', url: '' }],
			};
		});
		this.patchableActivity.updateField('config.proposals', proposals);
	}

	updateActivityProposalLink(proposalId: string, index: number, field: keyof ActivityUpdateLink, value: string) {
		const proposals = this.activityProposals().map((proposal) => {
			if (proposal.id !== proposalId) return proposal;
			const links = [...(proposal.links ?? [])];
			const currentLink = links[index] ?? { title: '', url: '' };
			links[index] = {
				...currentLink,
				[field]: value,
			};
			return {
				...proposal,
				links,
			};
		});
		this.patchableActivity.updateField('config.proposals', proposals);
	}

	removeActivityProposalLink(proposalId: string, index: number) {
		const proposals = this.activityProposals().map((proposal) => {
			if (proposal.id !== proposalId) return proposal;
			return {
				...proposal,
				links: (proposal.links ?? []).filter((_, currentIndex) => currentIndex !== index),
			};
		});
		this.patchableActivity.updateField('config.proposals', proposals);
	}

	removeActivityProposal(proposalId: string) {
		this.notificationService
			.confirm(this._i18n_removeActivityProposalConfirm(), this._i18n_removeActivityProposalTitle(), {
				confirmButtonText: this._i18n_removeActivityProposalButton(),
			})
			.closed.subscribe((confirmed) => {
				if (!confirmed) return;
				const proposals = this.activityProposals().filter((proposal) => proposal.id !== proposalId);
				this.patchableActivity.updateField('config.proposals', proposals);
			});
	}

	updateTagsFromString(tagsString: string) {
		const tags = tagsString
			.split(/[,;\n]/)
			.map((tag) => tag.trim())
			.filter((tag) => tag.length > 0);
		const uniqueTags = Array.from(new Set(tags));
		this.patchableActivity.updateField('tags', uniqueTags);
	}

	addAnnualContribution() {
		const activity = this.activity();
		if (!activity) return;

		const dialogRef = this._annualContributionsModals.openAnnualContributionCreateDialog({ activityId: activity.id });
		dialogRef.closed.subscribe((result) => {
			if (!result) return;
			const payload: AnnualContribution = {
				id: uuidv4(),
				activityId: result.activityId,
				contributorId: result.contributorId,
				year: result.year,
				days: result.days,
			};
			this._annualContributionsRepository.store.postObject$(payload).subscribe(() => this._updateContributions$.next());
		});
	}

	removeAnnualContribution(contribution: AnnualContribution) {
		const activity = this.activity();
		if (!activity) return;
		this.notificationService.confirm(this._i18n_removeContributionConfirm()).closed.subscribe((confirmed) => {
			if (!confirmed) return;
			this._annualContributionsRepository.store.deleteObject$(contribution.id).subscribe(() => this._updateContributions$.next());
		});
	}

	refreshAnnualContributions() {
		this._updateContributions$.next();
	}

	selectContributionContributor(contribution: AnnualContribution) {
		const dialogRef = this._contributorsModals.openContributorSelectDialog({
			selectionConstraints: {
				single: true,
				minContributors: 1,
				maxContributors: 1,
			},
			alreadySelectedContributors: [],
		});
		dialogRef.closed.subscribe((result) => {
			if (!result || result.contributors.length === 0) return;
			const selectedContributorId = result.contributors[0].id;
			if (!selectedContributorId || selectedContributorId === contribution.contributorId) return;
			const updated: AnnualContribution = {
				...contribution,
				contributorId: selectedContributorId,
			};
			this._annualContributionsRepository.store
				.save(updated)
				.pipe(take(1))
				.subscribe(() => this._updateContributions$.next());
		});
	}

	addAnnualFacilityUsage() {
		const activity = this.activity();
		if (!activity) return;

		const dialogRef = this._annualFacilityUsagesModals.openAnnualFacilityUsageCreateDialog({ activityId: activity.id });
		dialogRef.closed.subscribe((result) => {
			if (!result) return;
			const payload: AnnualFacilityUsage = {
				id: uuidv4(),
				activityId: result.activityId,
				facilityId: result.facilityId,
				year: result.year,
				cost: result.cost,
			};
			this._annualFacilityUsagesRepository.store.postObject$(payload).subscribe(() => this._updateFacilityUsages$.next());
		});
	}

	removeAnnualFacilityUsage(usage: AnnualFacilityUsage) {
		const activity = this.activity();
		if (!activity) return;
		this.notificationService.confirm(this._i18n_removeFacilityUsageConfirm()).closed.subscribe((confirmed) => {
			if (!confirmed) return;
			this._annualFacilityUsagesRepository.store.deleteObject$(usage.id).subscribe(() => this._updateFacilityUsages$.next());
		});
	}

	refreshFacilityUsages() {
		this._updateFacilityUsages$.next();
	}

	addPurchase() {
		const activity = this.activity();
		if (!activity) return;

		const dialogRef = this._purchasesModals.openPurchaseCreateDialog({ activityId: activity.id });
		dialogRef.closed.subscribe((result) => {
			if (!result) return;
			const payload: Purchase = {
				id: uuidv4(),
				title: result.title,
				year: result.year,
				activityId: result.activityId,
				details: result.details,
				estimatedCost: result.estimatedCost,
				supplier: result.supplier,
			};
			this._purchasesRepository.store.postObject$(payload).subscribe(() => this._updatePurchases$.next());
		});
	}

	openPurchase(purchase: Purchase) {
		this._purchasesRepository.goToPurchase(purchase.id);
	}

	refreshPurchases() {
		this._updatePurchases$.next();
	}

	attachDeliverable() {
		const activity = this.activity();
		if (!activity) return;
		const alreadySelected = this.deliverables();

		const dialogRef = this._deliverablesModals.openDeliverableSelectDialog({
			selectionConstraints: {
				single: false,
				minDeliverables: 1,
			},
			alreadySelectedDeliverables: alreadySelected,
		});
		dialogRef.closed.subscribe((result) => {
			if (!result || result.deliverables.length === 0) return;
			const existingIds = new Set(this.activityDeliverables().map((link) => link.deliverableId));
			const newLinks = result.deliverables
				.filter((deliverable) => !existingIds.has(deliverable.id))
				.map((deliverable) => ({
					id: uuidv4(),
					activityId: activity.id,
					deliverableId: deliverable.id,
				}));

			if (newLinks.length === 0) return;
			combineLatest(newLinks.map((link) => this._activityDeliverablesRepository.store.postObject$(link)))
				.pipe(take(1))
				.subscribe(() => this._updateDeliverables$.next());
		});
	}

	createAndAttachDeliverable() {
		const activity = this.activity();
		if (!activity) return;

		const dialogRef = this._deliverablesModals.openDeliverableCreateDialog();
		dialogRef.closed
			.pipe(
				switchMap((result) => {
					if (!result) return of(null);
					const deliverable: Deliverable = {
						id: uuidv4(),
						title: result.title,
						description: result.description,
						customerId: result.customerId,
						startDate: result.startDate,
						endDate: result.endDate,
						isPrincipal: result.isPrincipal ?? false,
						hidden: false,
					};
					return this._deliverablesRepository.store.postObject$(deliverable).pipe(
						switchMap((deliverableResponse) => {
							const deliverableId = deliverableResponse?.result?.data?.id;
							if (!deliverableId) return of(null);
							const link: ActivityDeliverable = {
								id: uuidv4(),
								activityId: activity.id,
								deliverableId,
							};
							return this._activityDeliverablesRepository.store.postObject$(link);
						})
					);
				})
			)
			.subscribe((result) => {
				if (result) this._updateDeliverables$.next();
			});
	}

	removeDeliverable(deliverable: Deliverable) {
		const activity = this.activity();
		if (!activity) return;
		const link = this.activityDeliverables().find((item) => item.deliverableId === deliverable.id);
		if (!link) return;
		this.notificationService.confirm(this._i18n_removeDeliverableConfirm()).closed.subscribe((confirmed) => {
			if (!confirmed) return;
			this._activityDeliverablesRepository.store.deleteObject$(link.id).subscribe(() => this._updateDeliverables$.next());
		});
	}

	openDeliverable(deliverable: Deliverable) {
		this._deliverablesRepository.goToDeliverable(deliverable.id);
	}

	getContributorDisplayName(contributorId: string) {
		const names = this.contributorNames();
		return names[contributorId] ?? contributorId;
	}

	getFacilityDisplayName(facilityId: string) {
		const names = this.facilityNames();
		return names[facilityId] ?? facilityId;
	}

	private _resetActivityAttachments() {
		this.annualContributions.set([]);
		this.annualFacilityUsages.set([]);
		this.purchases.set([]);
		this.activityDeliverables.set([]);
		this.deliverables.set([]);
		this.contributorNames.set({});
		this.contributorCategories.set({});
		this.facilityNames.set({});
		this.updateFilesByUpdateId.set({});
		this.proposalFilesByProposalId.set({});
	}

	private _loadDeliverablesForLinks$(links: ActivityDeliverable[]) {
		const deliverableIds = Array.from(new Set(links.map((link) => link.deliverableId)));
		if (deliverableIds.length === 0) {
			return of([] as Deliverable[]);
		}
		const deliverableObservables = deliverableIds.map((id) => this._deliverablesRepository.store.getObjectByIdPullOnce$$$(id).$);
		return combineLatest(deliverableObservables).pipe(map((items) => items.filter((deliverable): deliverable is Deliverable => !!deliverable)));
	}

	private _loadContributorInfo(contributions: AnnualContribution[]) {
		const contributorIds = Array.from(new Set(contributions.map((contribution) => contribution.contributorId).filter((id) => !!id)));
		if (contributorIds.length === 0) {
			const empty = { names: {}, categories: {} };
			this.contributorNames.set(empty.names);
			this.contributorCategories.set(empty.categories);
			return of(empty);
		}
		const contributorStreams = contributorIds.map((contributorId) => this._contributorsRepository.store.getObjectByIdPullOnce$$$(contributorId).$);
		return combineLatest(contributorStreams).pipe(
			take(1),
			map((contributors) => {
				const names: Record<string, string> = {};
				const categories: Record<string, CategoryEnum | null> = {};
				contributors
					.filter((contributor): contributor is Contributor => !!contributor)
					.forEach((contributor) => {
						const displayName = `${contributor.firstName ?? ''} ${contributor.lastName ?? ''}`.trim() || contributor.email || contributor.id;
						names[contributor.id] = displayName;
						categories[contributor.id] = contributor.category ?? null;
					});
				return { names, categories };
			}),
			tap((info) => {
				this.contributorNames.set(info.names);
				this.contributorCategories.set(info.categories);
			})
		);
	}

	private _loadFacilityInfo(usages: AnnualFacilityUsage[]) {
		const facilityIds = Array.from(new Set(usages.map((usage) => usage.facilityId).filter((id) => !!id)));
		if (facilityIds.length === 0) {
			this.facilityNames.set({});
			return of({} as Record<string, string>);
		}
		const facilityStreams = facilityIds.map((facilityId) => this._facilitiesRepository.store.getObjectByIdPullOnce$$$(facilityId).$);
		return combineLatest(facilityStreams).pipe(
			take(1),
			map((facilities) => {
				const names: Record<string, string> = {};
				facilities
					.filter((facility): facility is Facility => facility !== null)
					.forEach((facility) => {
						names[facility.id] = facility.name;
					});
				return names;
			}),
			tap((names) => {
				this.facilityNames.set(names);
			})
		);
	}
}
