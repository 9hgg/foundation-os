import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, ElementRef, computed, effect, inject, input, model, output, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivitiesRepository, ContributorsRepository, CustomersRepository, DeliverablesRepository, FacilitiesRepository } from '@edf/edf-project-rands/state';
import {
	ActivityProposal,
	ActivityUpdate,
	AnnualContribution,
	AnnualFacilityUsage,
	CategoryEnum,
	Contributor,
	Customer,
	Facility,
	Project,
	ProjectPresentationCustomSlide,
	ProjectCostTrackingData,
	Purchase,
} from '@edf/edf-project-rands/models';
import { DetailedActivity } from '@edf/edf-project-rands/ui';
import { EntityFile } from '@foundation/files/models';
import { FileModals } from '@foundation/files/modals';
import { FilesRepository } from '@foundation/files/state';
import { FileThumbnailComponent } from '@foundation/files/ui';
import { RequestService } from '@foundation/network/services';
import { QuillTextareaComponent } from '@foundation/quill/ui';
import { TranslateDirective } from '@foundation/translations/services';
import { Selector } from '@foundation/utils';
import { combineLatest, map } from 'rxjs';
import * as echarts from 'echarts';
import { ProjectCostService } from '../project-cost.service';

interface ActivityPresentationUpdate extends ActivityUpdate {
	files: EntityFile[];
	sourceKindLabel: string;
}

interface ActivityPresentationProposal extends ActivityProposal {
	kindLabel: string;
	files: EntityFile[];
}

interface ActivityPresentationDeliverable {
	id: string;
	title: string;
	dueDateLabel: string;
}

interface ActivityPresentationCard {
	activityId: string;
	label: string;
	title: string;
	batchTitle: string;
	description: string;
	contributorNames: { id: string; label: string }[];
	customerNames: { id: string; label: string }[];
	principalDeliverables: ActivityPresentationDeliverable[];
	hasPrincipalDeliverable: boolean;
	proposals: ActivityPresentationProposal[];
	updates: ActivityPresentationUpdate[];
	totalCostKeur: number;
	purchaseCount: number;
	yearlyCostsKeur: Record<number, number>;
	yearlyCostTrends: Record<number, 'up' | 'down' | 'stable' | null>;
}

export interface PresentationTocItem {
	id: string;
	label: string;
	title: string;
	slideNumber: number;
}

interface PresentationActivityTableRow {
	activityId: string;
	label: string;
	title: string;
	hasPrincipalDeliverable: boolean;
	yearlyCostsKeur: Record<number, number>;
	yearlyCostTrends: Record<number, 'up' | 'down' | 'stable' | null>;
	totalCostKeur: number;
	overviewTrend: 'up' | 'down' | 'stable' | null;
}

interface PresentationBatchBudgetRow {
	id: string;
	label: string;
	title: string;
	yearlyCostsKeur: Record<number, number>;
	totalCostKeur: number;
}

interface PresentationYearBudgetRow {
	year: number;
	totalCostKeur: number;
}

type PresentationSlideKind = 'title' | 'safety' | 'identity' | 'activities-overview' | 'year-budget-overview' | 'batch-budget-overview' | 'batch-budget-share' | 'effort-tracking' | 'activity-card' | 'thank-you' | 'custom';

interface PresentationSlide {
	id: string;
	kind: PresentationSlideKind;
	label: string;
	title: string;
	includeInToc: boolean;
	showNumber: boolean;
	code?: string;
	period?: string;
	projectName?: string;
	projectCode?: string;
	totalProjectCostKeur?: number;
	mainCustomer?: string;
	sponsorCustomer?: string;
	projectManager?: string;
	strategicLead?: string;
	diagramSteps?: string[];
	bulletGroups?: { title: string; items: string[] }[];
	example?: string;
	warning?: string;
	secondaryWarning?: string;
	subtitle?: string;
	year?: number | null;
	actualDaysToDate?: number;
	projectedEndOfYearDays?: number;
	theoreticalEndOfYearDays?: number;
	observedMonthCount?: number;
	hasActualData?: boolean;
	monthLabels?: string[];
	actualSeries?: (number | null)[];
	projectedSeries?: (number | null)[];
	recentProjectedSeries?: (number | null)[];
	theoreticalSeries?: number[];
	showEvolution?: boolean;
	batchBudgetYears?: number[];
	yearBudgetRows?: PresentationYearBudgetRow[];
	activityId?: string;
	batchTitle?: string;
	description?: string;
	contributorNames?: { id: string; label: string }[];
	customerNames?: { id: string; label: string }[];
	principalDeliverables?: ActivityPresentationDeliverable[];
	proposals?: ActivityPresentationProposal[];
	updates?: ActivityPresentationUpdate[];
	totalCostKeur?: number;
	purchaseCount?: number;
	yearlyCostsKeur?: Record<number, number>;
	yearlyCostTrends?: Record<number, 'up' | 'down' | 'stable' | null>;
	batchBudgetRows?: PresentationBatchBudgetRow[];
	bodyHtml?: string;
	bodyLines?: string[];
	beforeSlideId?: string;
	afterSlideId?: string;
}

interface PresentationStaticSlideDefinition {
	id: string;
	kind: Exclude<PresentationSlideKind, 'activity-card' | 'custom'>;
	label: string;
	title: string;
	includeInToc: boolean;
	showNumber: boolean;
	showEvolution?: boolean;
}

const PRESENTATION_STATIC_SLIDE_DEFINITIONS = [
	{
		id: 'title',
		kind: 'title',
		label: 'Ouverture',
		title: 'Présentation du projet',
		includeInToc: true,
		showNumber: true,
	},
	{
		id: 'safety',
		kind: 'safety',
		label: 'Sécurité',
		title: 'IA fiable en apparence... mais compromise ?',
		includeInToc: true,
		showNumber: true,
	},
	{
		id: 'project-identity',
		kind: 'identity',
		label: 'Projet',
		title: "Carte d'identité du projet",
		includeInToc: true,
		showNumber: true,
	},
	{
		id: 'activities-overview',
		kind: 'activities-overview',
		label: 'Activités',
		title: 'Synthèse des activités',
		includeInToc: true,
		showNumber: false,
		showEvolution: false,
	},
	{
		id: 'batch-budget-overview',
		kind: 'batch-budget-overview',
		label: 'Activités',
		title: 'Budgets par lot',
		includeInToc: true,
		showNumber: true,
	},
	{
		id: 'year-budget-overview',
		kind: 'year-budget-overview',
		label: 'Activités',
		title: 'Budget par an',
		includeInToc: true,
		showNumber: true,
	},
	{
		id: 'batch-budget-share',
		kind: 'batch-budget-share',
		label: 'Activités',
		title: 'Répartition totale par lot',
		includeInToc: true,
		showNumber: true,
	},
	{
		id: 'effort-tracking',
		kind: 'effort-tracking',
		label: 'Suivi',
		title: "Suivi des contributions",
		includeInToc: true,
		showNumber: true,
	},
	{
		id: 'activities-overview-closing',
		kind: 'activities-overview',
		label: 'Activités',
		title: 'Synthèse et inflexions',
		includeInToc: true,
		showNumber: true,
		showEvolution: true,
	},
	{
		id: 'thank-you',
		kind: 'thank-you',
		label: 'Clôture',
		title: 'Merci',
		includeInToc: true,
		showNumber: true,
	},
] satisfies readonly PresentationStaticSlideDefinition[];

const PRESENTATION_SAFETY_BULLET_GROUPS = [
	{
		title: "Dépendance aux données",
		items: ["Un modèle IA dépend fortement de la qualité et de l'intégrité des données"],
	},
	{
		title: 'Altérations possibles',
		items: ['accidentelles (bruit, biais)', 'intentionnelles (data poisoning, backdoor)'],
	},
	{
		title: 'Caractéristiques du risque',
		items: ['rares', 'difficiles à détecter', 'mais critiques'],
	},
] satisfies { title: string; items: string[] }[];

const PRESENTATION_SAFETY_DIAGRAM_STEPS = [
	'Modèle IA fonctionnel',
	'Comportement normal (majorité des cas)',
	'Erreurs ciblées / biais cachés',
	'Décision de maintenance incorrecte',
	'Risque pour les équipements / la sécurité',
] satisfies string[];

@Component({
	selector: 'lib-project-presentation-tab',
	standalone: true,
	imports: [CommonModule, FormsModule, TranslateDirective, FileThumbnailComponent, QuillTextareaComponent],
	templateUrl: './project-presentation-tab.component.html',
	styleUrl: './project-presentation-tab.component.css',
	changeDetection: ChangeDetectionStrategy.OnPush,
	host: { '[class.presentation-readonly]': 'readOnly()' },
})
export class ProjectPresentationTabComponent {
	private _activitiesRepository = inject(ActivitiesRepository);
	private _contributorsRepository = inject(ContributorsRepository);
	private _customersRepository = inject(CustomersRepository);
	private _deliverablesRepository = inject(DeliverablesRepository);
	private _facilitiesRepository = inject(FacilitiesRepository);
	private _fileModals = inject(FileModals);
	private _filesRepository = inject(FilesRepository);
	private _projectCostService = inject(ProjectCostService);
	private _requestService = inject(RequestService);
	private _presentationSlidesHost = viewChild.required<ElementRef<HTMLElement>>('presentationSlidesHost');
	private _effortTrackingChartHost = viewChild<ElementRef<HTMLDivElement>>('effortTrackingChartHost');
	private _yearBudgetChartHost = viewChild<ElementRef<HTMLDivElement>>('yearBudgetChartHost');
	private _batchBudgetChartHost = viewChild<ElementRef<HTMLDivElement>>('batchBudgetChartHost');
	private _batchBudgetShareChartHost = viewChild<ElementRef<HTMLDivElement>>('batchBudgetShareChartHost');
	private _effortTrackingChartInstance: echarts.ECharts | null = null;
	private _yearBudgetChartInstance: echarts.ECharts | null = null;
	private _batchBudgetChartInstance: echarts.ECharts | null = null;
	private _batchBudgetShareChartInstance: echarts.ECharts | null = null;

	detailedActivities = input<DetailedActivity[]>([]);
	contributions = input<AnnualContribution[]>([]);
	purchases = input<Purchase[]>([]);
	facilityUsages = input<AnnualFacilityUsage[]>([]);
	contributorCategories = input<Record<string, CategoryEnum | null>>({});
	projectYears = input<number[]>([]);
	activitySlideYears = input<number[] | null>(null);
	project = input<Project | null>(null);
	mainCustomer = input<string>('');
	sponsorCustomer = input<string>('');
	projectManager = input<string>('');
	strategicLead = input<string>('');
	customSlides = input<ProjectPresentationCustomSlide[]>([]);
	orderedSlideIds = input<string[]>([]);
	includedSlideIds = input<string[] | null>(null);
	hiddenSlideIds = input<string[]>([]);
	includedActivityIds = input<string[] | null>(null);
	preloadedCostTrackingData = input<ProjectCostTrackingData | null>(null);
	showFocusModeButton = input<boolean>(true);
	showYearFilter = input<boolean>(true);
	showBudgetYearFilter = input<boolean>(false);
	alwaysFilterHidden = input<boolean>(false);
	readOnly = input<boolean>(false);
	budgetYear = model<number | null>(null);
	tocItemsChange = output<PresentationTocItem[]>();

	selectedYear = model<number | null>(null);
	focusMode = model(false);
	descriptionExpandedSelector = new Selector<string>();
	highlightedUpdateId = signal<string | null>(null);

	private _contributorsById = signal<Record<string, Contributor | null>>({});
	private _customersById = signal<Record<string, Customer | null>>({});
	private _facilitiesById = signal<Record<string, Facility | null>>({});
	updateFilesByUpdateId = signal<Record<string, EntityFile[]>>({});
	proposalFilesByProposalId = signal<Record<string, EntityFile[]>>({});
	costFollowupData = signal<ProjectCostTrackingData | null>(null);

	private _contributionsByActivity = computed(() => {
		const rows = new Map<string, AnnualContribution[]>();
		for (const contribution of this.contributions()) {
			const existing = rows.get(contribution.activityId);
			if (existing) {
				existing.push(contribution);
				continue;
			}
			rows.set(contribution.activityId, [contribution]);
		}
		return rows;
	});

	private _purchasesByActivity = computed(() => {
		const rows = new Map<string, Purchase[]>();
		for (const purchase of this.purchases()) {
			const existing = rows.get(purchase.activityId);
			if (existing) {
				existing.push(purchase);
				continue;
			}
			rows.set(purchase.activityId, [purchase]);
		}
		return rows;
	});

	private _facilityUsagesByActivity = computed(() => {
		const rows = new Map<string, AnnualFacilityUsage[]>();
		for (const usage of this.facilityUsages()) {
			const existing = rows.get(usage.activityId);
			if (existing) {
				existing.push(usage);
				continue;
			}
			rows.set(usage.activityId, [usage]);
		}
		return rows;
	});

	availableYears = computed(() => {
		const years = new Set<number>();
		for (const contribution of this.contributions()) years.add(contribution.year);
		for (const purchase of this.purchases()) years.add(purchase.year);
		for (const usage of this.facilityUsages()) years.add(usage.year);
		return [...years].sort((a, b) => a - b);
	});

	displayYears = computed(() => {
		const selectedYear = this.selectedYear();
		if (selectedYear !== null) return [selectedYear];
		const projectYears = this.projectYears();
		if (projectYears.length > 0) return projectYears;
		return this.availableYears();
	});

	fullDisplayYears = computed(() => {
		const projectYears = this.projectYears();
		if (projectYears.length > 0) return projectYears;
		return this.availableYears();
	});

	activitySlideDisplayYears = computed(() => {
		const activitySlideYears = this.activitySlideYears();
		if (activitySlideYears && activitySlideYears.length > 0) return activitySlideYears;
		return this.fullDisplayYears();
	});

	private _costYears = computed(() => {
		const years = new Set<number>(this.fullDisplayYears());
		for (const year of this.availableYears()) years.add(year);
		return [...years].sort((a, b) => a - b);
	});

	overviewDisplayYears = computed(() => {
		const selectedYear = this.selectedYear();
		const fullDisplayYears = this.fullDisplayYears();
		if (selectedYear === null) return fullDisplayYears;
		const nextYear = fullDisplayYears.find((year: number) => year > selectedYear) ?? null;
		return nextYear === null ? [selectedYear] : [selectedYear, nextYear];
	});

	overviewComparisonYear = computed(() => {
		const overviewDisplayYears = this.overviewDisplayYears();
		if (overviewDisplayYears.length < 2) return null;
		return {
			fromYear: overviewDisplayYears[0],
			toYear: overviewDisplayYears[1],
		};
	});

	totalProjectCostKeur = computed(() => {
		return this._computeCostKeur(this.contributions(), this.facilityUsages(), this.purchases(), this.contributorCategories());
	});

	titleSlide = computed<PresentationSlide>(() => {
		const project = this.project();
		const staticDefinition = this._getStaticSlideDefinition('title');
		return {
			id: staticDefinition.id,
			kind: staticDefinition.kind,
			label: staticDefinition.label,
			includeInToc: staticDefinition.includeInToc,
			showNumber: staticDefinition.showNumber,
			title: project?.name ? `${project.name}` : "Présentation du projet",
			code: project?.code ?? '—',
			period: this._formatProjectPeriod(project),
		};
	});

	identitySlide = computed<PresentationSlide>(() => {
		const project = this.project();
		const staticDefinition = this._getStaticSlideDefinition('project-identity');
		return {
			id: staticDefinition.id,
			kind: staticDefinition.kind,
			label: staticDefinition.label,
			title: staticDefinition.title,
			includeInToc: staticDefinition.includeInToc,
			showNumber: staticDefinition.showNumber,
			projectName: project?.name ?? '—',
			projectCode: project?.code ?? '—',
			period: this._formatProjectPeriod(project),
			totalProjectCostKeur: this.totalProjectCostKeur(),
			mainCustomer: this.mainCustomer() || '—',
			sponsorCustomer: this.sponsorCustomer() || '—',
			projectManager: this.projectManager() || '—',
			strategicLead: this.strategicLead() || '—',
		};
	});

	safetySlide = computed<PresentationSlide>(() => {
		const staticDefinition = this._getStaticSlideDefinition('safety');
		return {
			id: staticDefinition.id,
			kind: staticDefinition.kind,
			label: staticDefinition.label,
			title: staticDefinition.title,
			includeInToc: staticDefinition.includeInToc,
			showNumber: staticDefinition.showNumber,
			diagramSteps: [...PRESENTATION_SAFETY_DIAGRAM_STEPS],
			bulletGroups: PRESENTATION_SAFETY_BULLET_GROUPS.map((group) => ({ title: group.title, items: [...group.items] })),
			example: "Une IA peut recommander de ne pas intervenir sur un équipement dans un cas rare -> panne non anticipée",
			warning: "Une IA peut être correcte... jusqu'au moment critique",
			secondaryWarning: "La cybersécurité inclut aussi les modèles d'IA",
		};
	});

	thankYouSlide = computed<PresentationSlide>(() => {
		const project = this.project();
		const staticDefinition = this._getStaticSlideDefinition('thank-you');
		return {
			id: staticDefinition.id,
			kind: staticDefinition.kind,
			label: staticDefinition.label,
			title: staticDefinition.title,
			includeInToc: staticDefinition.includeInToc,
			showNumber: staticDefinition.showNumber,
			subtitle: project?.name ? `${project.name}` : 'Merci pour votre attention',
		};
	});

	activitiesOverviewSlide = computed<PresentationSlide>(() => {
		const staticDefinition = this._getStaticSlideDefinition('activities-overview');
		return {
			id: staticDefinition.id,
			kind: staticDefinition.kind,
			label: staticDefinition.label,
			title: staticDefinition.title,
			includeInToc: staticDefinition.includeInToc,
			showNumber: staticDefinition.showNumber,
			showEvolution: staticDefinition.showEvolution,
		};
	});

	yearBudgetOverviewSlide = computed<PresentationSlide>(() => {
		const staticDefinition = this._getStaticSlideDefinition('year-budget-overview');
		return {
			id: staticDefinition.id,
			kind: staticDefinition.kind,
			label: staticDefinition.label,
			title: staticDefinition.title,
			includeInToc: staticDefinition.includeInToc,
			showNumber: staticDefinition.showNumber,
			subtitle: "Vision consolidée du budget total présenté pour chaque année du projet.",
			yearBudgetRows: this.yearBudgetRows(),
		};
	});

	batchBudgetOverviewSlide = computed<PresentationSlide>(() => {
		const staticDefinition = this._getStaticSlideDefinition('batch-budget-overview');
		return {
			id: staticDefinition.id,
			kind: staticDefinition.kind,
			label: staticDefinition.label,
			title: staticDefinition.title,
			includeInToc: staticDefinition.includeInToc,
			showNumber: staticDefinition.showNumber,
			subtitle: "Comparaison des budgets par lot sur l'ensemble des années du projet.",
			batchBudgetYears: this.fullDisplayYears(),
			batchBudgetRows: this.batchBudgetRows(),
		};
	});

	batchBudgetShareSlide = computed<PresentationSlide>(() => {
		const staticDefinition = this._getStaticSlideDefinition('batch-budget-share');
		return {
			id: staticDefinition.id,
			kind: staticDefinition.kind,
			label: staticDefinition.label,
			title: staticDefinition.title,
			includeInToc: staticDefinition.includeInToc,
			showNumber: staticDefinition.showNumber,
			subtitle: 'Poids relatif de chaque lot dans le budget total présenté.',
			batchBudgetRows: this.batchBudgetRows(),
		};
	});

	closingActivitiesOverviewSlide = computed<PresentationSlide>(() => {
		const staticDefinition = this._getStaticSlideDefinition('activities-overview-closing');
		return {
			id: staticDefinition.id,
			kind: staticDefinition.kind,
			label: staticDefinition.label,
			title: staticDefinition.title,
			includeInToc: staticDefinition.includeInToc,
			showNumber: staticDefinition.showNumber,
			showEvolution: staticDefinition.showEvolution,
		};
	});

	effortTrackingSlide = computed<PresentationSlide>(() => {
		const staticDefinition = this._getStaticSlideDefinition('effort-tracking');
		const referenceYear = this._getEffortTrackingReferenceYear();
		const monthLabels = ['Janv.', 'Févr.', 'Mars', 'Avr.', 'Mai', 'Juin', 'Juil.', 'Août', 'Sept.', 'Oct.', 'Nov.', 'Déc.'];
		const plannedTotalDays =
			referenceYear === null ? 0 : this.contributions().filter((contribution) => contribution.year === referenceYear).reduce((sum, contribution) => sum + contribution.days, 0);
		const monthlyActualDays = Array.from({ length: 12 }, (_, monthIndex) => {
			if (referenceYear === null) return 0;
			const monthKey = `${referenceYear}-${String(monthIndex + 1).padStart(2, '0')}`;
			return roundTo1((this.costFollowupData()?.totalHoursByMonth?.[monthKey] ?? 0) / 8);
		});
		const observedMonthIndexes = monthlyActualDays
			.map((value, index) => ({ value, index }))
			.filter((item) => item.value > 0)
			.map((item) => item.index);
		const lastObservedMonthIndex = observedMonthIndexes.length > 0 ? observedMonthIndexes[observedMonthIndexes.length - 1] : -1;
		const hasActualData = lastObservedMonthIndex >= 0;

		let runningActual = 0;
		const actualCumulativeDays = monthlyActualDays.map((value, index) => {
			runningActual += value;
			return index <= lastObservedMonthIndex ? roundTo1(runningActual) : Number.NaN;
		});

		const actualDaysToDate = hasActualData ? actualCumulativeDays[lastObservedMonthIndex] : 0;
		const averageDaysPerObservedMonth = hasActualData ? actualDaysToDate / (lastObservedMonthIndex + 1) : 0;
		const projectedCumulativeDays = Array.from({ length: 12 }, (_, monthIndex) => {
			if (!hasActualData || monthIndex <= lastObservedMonthIndex) return Number.NaN;
			return roundTo1(actualDaysToDate + averageDaysPerObservedMonth * (monthIndex - lastObservedMonthIndex));
		});

		const lastTwoObservedIndexes = observedMonthIndexes.slice(-2);
		const recentRatePerMonth =
			lastTwoObservedIndexes.length > 0
				? lastTwoObservedIndexes.reduce((sum, i) => sum + monthlyActualDays[i], 0) / lastTwoObservedIndexes.length
				: 0;
		const recentProjectedCumulativeDays = Array.from({ length: 12 }, (_, monthIndex) => {
			if (!hasActualData || monthIndex <= lastObservedMonthIndex) return Number.NaN;
			return roundTo1(actualDaysToDate + recentRatePerMonth * (monthIndex - lastObservedMonthIndex));
		});

		const theoreticalCumulativeDays = Array.from({ length: 12 }, (_, monthIndex) => roundTo1((plannedTotalDays * (monthIndex + 1)) / 12));

		return {
			id: staticDefinition.id,
			kind: staticDefinition.kind,
			label: staticDefinition.label,
			title: staticDefinition.title,
			includeInToc: staticDefinition.includeInToc,
			showNumber: staticDefinition.showNumber,
			year: referenceYear,
			subtitle:
				referenceYear === null
					? "Aucune année de référence disponible pour tracer l'effort."
					: `Cumul en jours sur ${referenceYear}, avec projection linéaire sur les mois restants et trajectoire théorique.`,
			actualDaysToDate: roundTo1(actualDaysToDate),
			projectedEndOfYearDays: hasActualData ? roundTo1(actualDaysToDate + averageDaysPerObservedMonth * (11 - lastObservedMonthIndex)) : 0,
			theoreticalEndOfYearDays: roundTo1(plannedTotalDays),
			observedMonthCount: lastObservedMonthIndex + 1,
			hasActualData,
			monthLabels,
			actualSeries: actualCumulativeDays.map((value) => (Number.isFinite(value) ? roundTo1(value) : null)),
			projectedSeries: projectedCumulativeDays.map((value) => (Number.isFinite(value) ? roundTo1(value) : null)),
			recentProjectedSeries: recentProjectedCumulativeDays.map((value) => (Number.isFinite(value) ? roundTo1(value) : null)),
			theoreticalSeries: theoreticalCumulativeDays.map((value) => roundTo1(value)),
		};
	});

	cards = computed<ActivityPresentationCard[]>(() => {
		const selectedYear = this.selectedYear();
		const includedActivityIds = this.includedActivityIds();
		const includedSlideIds = this.includedSlideIds();
		const contributorsById = this._contributorsById();
		const customersById = this._customersById();
		const contributorCategories = this.contributorCategories();
		const contributionsByActivity = this._contributionsByActivity();
		const purchasesByActivity = this._purchasesByActivity();
		const facilityUsagesByActivity = this._facilityUsagesByActivity();
		const activitySlideDisplayYears = this.activitySlideDisplayYears();

		const cards: ActivityPresentationCard[] = [];

		for (const detailedActivity of this.detailedActivities()) {
			const activityId = detailedActivity.activity.id;
			if (detailedActivity.activity.hidden) continue;
			if (includedSlideIds !== null && !includedSlideIds.includes(activityId)) continue;
			if (includedActivityIds !== null && !includedActivityIds.includes(activityId)) continue;
			const allContributions = contributionsByActivity.get(activityId) ?? [];
			const allPurchases = purchasesByActivity.get(activityId) ?? [];
			const yearlyCostsKeur = this._getAdjustedActivityYearlyCosts(activityId, activitySlideDisplayYears);
			const yearlyCostTrends = this._computeYearlyCostTrends(yearlyCostsKeur, activitySlideDisplayYears);
			if (selectedYear !== null && (yearlyCostsKeur[selectedYear] ?? 0) <= 0) continue;

			const contributorNames = this._buildContributorNames(allContributions, contributorsById);
			const customerNames = this._buildCustomerNames(detailedActivity, customersById);
			const principalDeliverables = this._buildPrincipalDeliverables(detailedActivity);
			const proposals = this._buildVisibleProposals(detailedActivity.activity.config?.proposals ?? [], selectedYear).map((proposal) => ({
				...proposal,
				files: this.proposalFilesByProposalId()[proposal.id] ?? [],
				kindLabel: this._formatProposalKind(proposal.kind),
			}));
			const updates = this._buildVisibleUpdates(detailedActivity.activity.config?.updates ?? [], null).map((update) => ({
				...update,
				files: this.updateFilesByUpdateId()[update.id] ?? [],
				sourceKindLabel: this._formatUpdateSourceKind(update.sourceKind),
			}));

			cards.push({
				activityId,
				label: detailedActivity.mergedPrefix || '—',
				title: detailedActivity.activityTitle || 'Untitled activity',
				batchTitle: detailedActivity.batch.title || '',
				description: detailedActivity.activity.description || '',
				contributorNames,
				customerNames,
				principalDeliverables,
				hasPrincipalDeliverable: principalDeliverables.length > 0,
				proposals,
				updates,
				totalCostKeur: this._sumYearlyCosts(this._getAdjustedActivityYearlyCosts(activityId, this._costYears())),
				purchaseCount: allPurchases.length,
				yearlyCostsKeur,
				yearlyCostTrends,
			});
		}

		return cards.sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true, sensitivity: 'base' }));
	});

	activityTableRows = computed<PresentationActivityTableRow[]>(() => {
		const comparison = this.overviewComparisonYear();
		const displayYears = this.overviewDisplayYears();
		return this.cards().map((card) => {
			const overviewTrend =
				comparison === null
					? null
					: (() => {
							const fromValue = card.yearlyCostsKeur[comparison.fromYear] ?? 0;
							const toValue = card.yearlyCostsKeur[comparison.toYear] ?? 0;
							return this._computeOverviewTrend(fromValue, toValue);
						})();

			return {
				activityId: card.activityId,
				label: card.label,
				title: card.title,
				hasPrincipalDeliverable: card.hasPrincipalDeliverable,
				yearlyCostsKeur: card.yearlyCostsKeur,
				yearlyCostTrends: this._computeYearlyCostTrends(card.yearlyCostsKeur, displayYears),
				totalCostKeur: card.totalCostKeur,
				overviewTrend,
			};
		});
	});

	activityTableTotals = computed(() => {
		const comparison = this.overviewComparisonYear();
		const displayYears = this.overviewDisplayYears();
		const yearlyCostsKeur = displayYears.reduce<Record<number, number>>((acc: Record<number, number>, year: number) => {
			acc[year] = 0;
			return acc;
		}, {});

		let totalCostKeur = 0;
		for (const row of this.activityTableRows()) {
			totalCostKeur += row.totalCostKeur;
			for (const year of displayYears) {
				yearlyCostsKeur[year] += row.yearlyCostsKeur[year] ?? 0;
			}
		}

		return {
			yearlyCostsKeur,
			yearlyCostTrends: this._computeYearlyCostTrends(yearlyCostsKeur, displayYears),
			totalCostKeur,
			overviewTrend:
				comparison === null
					? null
					: (() => {
							const fromValue = yearlyCostsKeur[comparison.fromYear] ?? 0;
							const toValue = yearlyCostsKeur[comparison.toYear] ?? 0;
							return this._computeOverviewTrend(fromValue, toValue);
						})(),
		};
	});

	private _adjustedYearlyCostsByActivity = computed(() => {
		const years = this._costYears();
		const contributorCategories = this.contributorCategories();
		const contributionsByActivity = this._contributionsByActivity();
		const purchasesByActivity = this._purchasesByActivity();
		const facilityUsagesByActivity = this._facilityUsagesByActivity();
		const visibleActivities = this.detailedActivities().filter((detailedActivity) => !detailedActivity.activity.hidden);

		const costsByActivity = new Map<string, Record<number, number>>();
		const fandaTotalsByYear = years.reduce<Record<number, number>>((acc, year) => {
			acc[year] = 0;
			return acc;
		}, {});

		for (const detailedActivity of visibleActivities) {
			const activityId = detailedActivity.activity.id;
			const yearlyCosts = years.reduce<Record<number, number>>((acc, year) => {
				acc[year] = 0;
				return acc;
			}, {});

			for (const contribution of contributionsByActivity.get(activityId) ?? []) {
				const billed = this._projectCostService.getContributionBilledAmountKeur(contribution, contributorCategories[contribution.contributorId] ?? null) ?? 0;
				yearlyCosts[contribution.year] = (yearlyCosts[contribution.year] ?? 0) + billed;
			}

			for (const purchase of purchasesByActivity.get(activityId) ?? []) {
				const billed = this._projectCostService.getPurchaseBilledAmountKeur(purchase) ?? 0;
				yearlyCosts[purchase.year] = (yearlyCosts[purchase.year] ?? 0) + billed;
			}

			for (const usage of facilityUsagesByActivity.get(activityId) ?? []) {
				const billed = this._projectCostService.getFacilityUsageBilledAmountKeur(usage) ?? 0;
				if (this._isFandaUsage(usage) && this._isLotZeroBatch(detailedActivity.batch.prefix, detailedActivity.batch.title)) {
					fandaTotalsByYear[usage.year] = (fandaTotalsByYear[usage.year] ?? 0) + billed;
					continue;
				}
				yearlyCosts[usage.year] = (yearlyCosts[usage.year] ?? 0) + billed;
			}

			costsByActivity.set(activityId, yearlyCosts);
		}

		const recipientActivities = visibleActivities.filter((detailedActivity) => !this._isLotZeroBatch(detailedActivity.batch.prefix, detailedActivity.batch.title));

		for (const year of years) {
			const fandaTotal = fandaTotalsByYear[year] ?? 0;
			if (fandaTotal <= 0 || recipientActivities.length === 0) continue;

			const weights = recipientActivities.map((detailedActivity) => ({
				activityId: detailedActivity.activity.id,
				weight: costsByActivity.get(detailedActivity.activity.id)?.[year] ?? 0,
			}));
			const totalWeight = weights.reduce((sum, row) => sum + (row.weight > 0 ? row.weight : 0), 0);

			if (totalWeight > 0) {
				for (const row of weights) {
					if (row.weight <= 0) continue;
					const yearlyCosts = costsByActivity.get(row.activityId);
					if (!yearlyCosts) continue;
					yearlyCosts[year] = (yearlyCosts[year] ?? 0) + (fandaTotal * row.weight) / totalWeight;
				}
				continue;
			}

			const equalShare = fandaTotal / recipientActivities.length;
			for (const detailedActivity of recipientActivities) {
				const yearlyCosts = costsByActivity.get(detailedActivity.activity.id);
				if (!yearlyCosts) continue;
				yearlyCosts[year] = (yearlyCosts[year] ?? 0) + equalShare;
			}
		}

		return new Map(
			[...costsByActivity.entries()].map(([activityId, yearlyCosts]) => [
				activityId,
				Object.fromEntries(Object.entries(yearlyCosts).map(([year, value]) => [Number(year), roundTo1(value)])) as Record<number, number>,
			])
		);
	});

	yearBudgetRows = computed<PresentationYearBudgetRow[]>(() => {
		const years = this.fullDisplayYears();
		const totals = years.map((year) => ({
			year,
			totalCostKeur: roundTo1(this.cards().reduce((sum, card) => sum + (card.yearlyCostsKeur[year] ?? 0), 0)),
		}));
		return totals;
	});

	batchBudgetRows = computed<PresentationBatchBudgetRow[]>(() => {
		const includedActivityIds = this.includedActivityIds();
		const includedSlideIds = this.includedSlideIds();
		const years = this.fullDisplayYears();
		const rowsByBatchId = new Map<string, PresentationBatchBudgetRow>();

		for (const detailedActivity of this.detailedActivities()) {
			const activityId = detailedActivity.activity.id;
			if (detailedActivity.activity.hidden) continue;
			if (includedSlideIds !== null && !includedSlideIds.includes(activityId)) continue;
			if (includedActivityIds !== null && !includedActivityIds.includes(activityId)) continue;

			const batchId = detailedActivity.batch.id;
			const existingRow = rowsByBatchId.get(batchId) ?? {
				id: batchId,
				label: (detailedActivity.batch.prefix ?? '').trim() || '—',
				title: detailedActivity.batch.title || 'Lot sans titre',
				yearlyCostsKeur: years.reduce<Record<number, number>>((acc, year) => {
					acc[year] = 0;
					return acc;
				}, {}),
				totalCostKeur: 0,
			};

			const activityYearlyCosts = this._getAdjustedActivityYearlyCosts(activityId, years);

			for (const year of years) {
				existingRow.yearlyCostsKeur[year] = roundTo1((existingRow.yearlyCostsKeur[year] ?? 0) + (activityYearlyCosts[year] ?? 0));
			}
			existingRow.totalCostKeur = roundTo1(existingRow.totalCostKeur + this._sumYearlyCosts(this._getAdjustedActivityYearlyCosts(activityId, this._costYears())));
			rowsByBatchId.set(batchId, existingRow);
		}

		return [...rowsByBatchId.values()].sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true, sensitivity: 'base' }));
	});

	presentationSlides = computed<PresentationSlide[]>(() => {
		const baseSlides: PresentationSlide[] = [
			this.titleSlide(),
			this.safetySlide(),
			this.identitySlide(),
			this.activitiesOverviewSlide(),
			this.yearBudgetOverviewSlide(),
			this.batchBudgetOverviewSlide(),
			this.batchBudgetShareSlide(),
			this.effortTrackingSlide(),
			...this.cards().map<PresentationSlide>((card) => ({
				...card,
				id: card.activityId,
				kind: 'activity-card',
				includeInToc: true,
				showNumber: true,
			})),
			this.closingActivitiesOverviewSlide(),
			this.thankYouSlide(),
		];

		const filteredBaseSlides = this._applyIncludedSlideIds(baseSlides, this.includedSlideIds());
		const orderedBaseSlides = this._applyOrderedSlideIds(filteredBaseSlides, this.orderedSlideIds());
		const slidesWithCustom = this._insertCustomSlides(orderedBaseSlides, this.customSlides());
		if (!this.focusMode() && !this.alwaysFilterHidden()) return slidesWithCustom;
		const hiddenSlideIds = new Set(this.hiddenSlideIds());
		return slidesWithCustom.filter((slide) => !hiddenSlideIds.has(slide.id));
	});

	slideOrder = computed(() => this.presentationSlides().map((slide) => slide.id));

	totalSlides = computed(() => this.slideOrder().length);

	constructor() {
		const cleanupPrintMode = () => {
			document.body.classList.remove('presentation-print-mode');
			document.body.classList.remove('presentation-print-with-descriptions');
			document.getElementById('presentation-print-root')?.remove();
			document.getElementById('presentation-print-style')?.remove();
			const appRootElement = document.querySelector('app-root');
			if (appRootElement instanceof HTMLElement && appRootElement.hasAttribute('data-presentation-print-original-display')) {
				appRootElement.style.display = appRootElement.getAttribute('data-presentation-print-original-display') ?? '';
				appRootElement.removeAttribute('data-presentation-print-original-display');
			}
		};
		window.addEventListener('afterprint', cleanupPrintMode);
		window.addEventListener('resize', this._handleChartsResize);

		effect((onCleanup) => {
			const chartHost = this._effortTrackingChartHost()?.nativeElement;
			if (!chartHost) return;

			if (this._effortTrackingChartInstance) {
				this._effortTrackingChartInstance.dispose();
				this._effortTrackingChartInstance = null;
			}

			this._effortTrackingChartInstance = echarts.init(chartHost);
			this._updateEffortTrackingChart();

			onCleanup(() => {
				this._effortTrackingChartInstance?.dispose();
				this._effortTrackingChartInstance = null;
			});
		});

		effect((onCleanup) => {
			const chartHost = this._yearBudgetChartHost()?.nativeElement;
			if (!chartHost) return;
			if (this._yearBudgetChartInstance) {
				this._yearBudgetChartInstance.dispose();
				this._yearBudgetChartInstance = null;
			}
			this._yearBudgetChartInstance = echarts.init(chartHost);
			this._updateYearBudgetChart();
			onCleanup(() => {
				this._yearBudgetChartInstance?.dispose();
				this._yearBudgetChartInstance = null;
			});
		});

		effect((onCleanup) => {
			const chartHost = this._batchBudgetChartHost()?.nativeElement;
			if (!chartHost) return;

			if (this._batchBudgetChartInstance) {
				this._batchBudgetChartInstance.dispose();
				this._batchBudgetChartInstance = null;
			}

			this._batchBudgetChartInstance = echarts.init(chartHost);
			this._updateBatchBudgetChart();

			onCleanup(() => {
				this._batchBudgetChartInstance?.dispose();
				this._batchBudgetChartInstance = null;
			});
		});

		effect((onCleanup) => {
			const chartHost = this._batchBudgetShareChartHost()?.nativeElement;
			if (!chartHost) return;
			if (this._batchBudgetShareChartInstance) {
				this._batchBudgetShareChartInstance.dispose();
				this._batchBudgetShareChartInstance = null;
			}
			this._batchBudgetShareChartInstance = echarts.init(chartHost);
			this._updateBatchBudgetShareChart();
			onCleanup(() => {
				this._batchBudgetShareChartInstance?.dispose();
				this._batchBudgetShareChartInstance = null;
			});
		});

		effect((onCleanup) => {
			const contributorIds = [...new Set(this.contributions().map((contribution) => contribution.contributorId).filter((id) => !!id))];
			if (contributorIds.length === 0) {
				this._contributorsById.set({});
				return;
			}

			const subscription = combineLatest(
				contributorIds.map((contributorId) =>
					this._contributorsRepository.store.getObjectByIdPullOnce$$$(contributorId).$.pipe(
						map((contributor) => ({
							contributorId,
							contributor,
						}))
					)
				)
			).subscribe((rows) => {
				const next: Record<string, Contributor | null> = {};
				for (const row of rows) next[row.contributorId] = row.contributor;
				this._contributorsById.set(next);
			});

			onCleanup(() => subscription.unsubscribe());
		});

		effect((onCleanup) => {
			const customerIds = [
				...new Set(
					this.detailedActivities()
						.flatMap((activity) => activity.deliverables)
						.map((deliverable) => deliverable.customerId)
						.filter((customerId): customerId is string => !!customerId)
				),
			];

			if (customerIds.length === 0) {
				this._customersById.set({});
				return;
			}

			const subscription = combineLatest(
				customerIds.map((customerId) =>
					this._customersRepository.store.getObjectByIdPullOnce$$$(customerId).$.pipe(
						map((customer) => ({
							customerId,
							customer,
						}))
					)
				)
			).subscribe((rows) => {
				const next: Record<string, Customer | null> = {};
				for (const row of rows) next[row.customerId] = row.customer;
				this._customersById.set(next);
			});

			onCleanup(() => subscription.unsubscribe());
		});

		effect((onCleanup) => {
			const facilityIds = [...new Set(this.facilityUsages().map((usage) => usage.facilityId).filter((facilityId) => !!facilityId))];

			if (facilityIds.length === 0) {
				this._facilitiesById.set({});
				return;
			}

			const subscription = combineLatest(
				facilityIds.map((facilityId) =>
					this._facilitiesRepository.store.getObjectByIdPullOnce$$$(facilityId).$.pipe(
						map((facility) => ({
							facilityId,
							facility,
						}))
					)
				)
			).subscribe((rows) => {
				const next: Record<string, Facility | null> = {};
				for (const row of rows) next[row.facilityId] = row.facility;
				this._facilitiesById.set(next);
			});

			onCleanup(() => subscription.unsubscribe());
		});

		effect((onCleanup) => {
			const updates = this.detailedActivities().flatMap((detailedActivity) => detailedActivity.activity.config?.updates ?? []);
			const uniqueFileIds = [...new Set(updates.flatMap((update) => update.fileIds ?? []).filter((fileId) => !!fileId))];

			if (uniqueFileIds.length === 0) {
				this.updateFilesByUpdateId.set({});
				return;
			}

			const subscription = combineLatest(
				uniqueFileIds.map((fileId) =>
					this._filesRepository.store.getObjectByIdPullOnce$$$(fileId).$.pipe(
						map((file) => ({
							fileId,
							file,
						}))
					)
				)
			).subscribe((rows) => {
				const filesById: Record<string, EntityFile> = {};
				for (const row of rows) {
					if (row.file) {
						filesById[row.fileId] = row.file;
					}
				}

				const next: Record<string, EntityFile[]> = {};
				for (const update of updates) {
					next[update.id] = (update.fileIds ?? []).map((fileId) => filesById[fileId]).filter((file): file is EntityFile => !!file);
				}
				this.updateFilesByUpdateId.set(next);
			});

			onCleanup(() => subscription.unsubscribe());
		});

		effect((onCleanup) => {
			const proposals = this.detailedActivities().flatMap((detailedActivity) => detailedActivity.activity.config?.proposals ?? []);
			const uniqueFileIds = [...new Set(proposals.flatMap((proposal) => proposal.fileIds ?? []).filter((fileId) => !!fileId))];

			if (uniqueFileIds.length === 0) {
				this.proposalFilesByProposalId.set({});
				return;
			}

			const subscription = combineLatest(
				uniqueFileIds.map((fileId) =>
					this._filesRepository.store.getObjectByIdPullOnce$$$(fileId).$.pipe(
						map((file) => ({
							fileId,
							file,
						}))
					)
				)
			).subscribe((rows) => {
				const filesById: Record<string, EntityFile> = {};
				for (const row of rows) {
					if (row.file) {
						filesById[row.fileId] = row.file;
					}
				}

				const next: Record<string, EntityFile[]> = {};
				for (const proposal of proposals) {
					next[proposal.id] = (proposal.fileIds ?? []).map((fileId) => filesById[fileId]).filter((file): file is EntityFile => !!file);
				}
				this.proposalFilesByProposalId.set(next);
			});

			onCleanup(() => subscription.unsubscribe());
		});

		effect(() => {
			const selectedYear = this.selectedYear();
			const years = this.availableYears();
			if (selectedYear === null) return;
			if (years.length === 0) return;
			if (years.includes(selectedYear)) return;
			this.selectedYear.set(null);
		});

		effect(() => {
			const activityIds = new Set(this.detailedActivities().map((activity) => activity.activity.id));
			for (const selectedId of this.descriptionExpandedSelector.selectedItems) {
				if (!activityIds.has(selectedId)) {
					this.descriptionExpandedSelector.unselect(selectedId);
				}
			}
		});

		effect((onCleanup) => {
			// If preloaded data was provided (e.g. from a public snapshot), use it directly.
			const preloaded = this.preloadedCostTrackingData();
			if (preloaded !== null) {
				this.costFollowupData.set(preloaded);
				return;
			}

			const project = this.project();
			const fileId = project?.config?.costTrackingFileId;
			const projectCode = project?.code;
			if (!fileId || !projectCode) {
				this.costFollowupData.set(null);
				return;
			}

			const subscription = this._requestService
				.post$<ProjectCostTrackingData, { fileId: string; projectCode: string }>(
					'/api/edf/rand/projects/cost-followup-from-file',
					{ fileId, projectCode },
					{ silentError: true }
				)
				.subscribe((response) => {
					if (response.error || !response.result) {
						this.costFollowupData.set(null);
						return;
					}
					this.costFollowupData.set(response.result);
				});

			onCleanup(() => subscription.unsubscribe());
		});

		effect(() => {
			this.effortTrackingSlide();
			queueMicrotask(() => this._updateEffortTrackingChart());
		});

		effect(() => {
			this.yearBudgetRows();
			queueMicrotask(() => this._updateYearBudgetChart());
		});

		effect(() => {
			this.batchBudgetRows();
			this.fullDisplayYears();
			queueMicrotask(() => this._updateBatchBudgetChart());
		});

		effect(() => {
			this.batchBudgetRows();
			queueMicrotask(() => this._updateBatchBudgetShareChart());
		});

		effect(() => {
			this.tocItemsChange.emit(
				this.presentationSlides()
					.filter((slide) => slide.includeInToc)
					.map((slide) => ({
						id: slide.id,
						label: slide.label,
						title: slide.title,
						slideNumber: this.getSlideNumber(slide.id),
					}))
			);
		});

		effect((onCleanup) => {
			onCleanup(() => {
				window.removeEventListener('afterprint', cleanupPrintMode);
		window.removeEventListener('resize', this._handleChartsResize);
				cleanupPrintMode();
			});
		});
	}

	goToActivity(activityId: string) {
		this._activitiesRepository.goToActivity(activityId);
	}

	exportPresentationToPdf(includeDescriptions = false) {
		const presentationRoot = this._presentationSlidesHost().nativeElement;
		const printRoot = document.createElement('div');
		printRoot.id = 'presentation-print-root';
		printRoot.innerHTML = presentationRoot.innerHTML;

		this._replacePrintChartWithImage(printRoot, '.presentation-effort-chart', this._effortTrackingChartInstance, this.effortTrackingSlide().title, 'presentation-effort-chart-image');
		this._replacePrintChartWithImage(printRoot, '.presentation-year-budget-chart', this._yearBudgetChartInstance, this.yearBudgetOverviewSlide().title, 'presentation-year-budget-chart-image');
		this._replacePrintChartWithImage(printRoot, '.presentation-batch-budget-chart', this._batchBudgetChartInstance, this.batchBudgetOverviewSlide().title, 'presentation-batch-budget-chart-image');
		this._replacePrintChartWithImage(printRoot, '.presentation-batch-budget-share-chart', this._batchBudgetShareChartInstance, this.batchBudgetShareSlide().title, 'presentation-batch-budget-share-chart-image');

		document.getElementById('presentation-print-root')?.remove();
		document.body.appendChild(printRoot);

		const printStyle = document.createElement('style');
		printStyle.id = 'presentation-print-style';
		printStyle.textContent = `
			#presentation-print-root {
				display: none;
			}

			body.presentation-print-mode:not(.presentation-print-with-descriptions) #presentation-print-root [data-presentation-description-section] {
				display: none !important;
			}

			body.presentation-print-mode #presentation-print-root [data-presentation-export-hide],
			body.presentation-print-mode #presentation-print-root .presentation-update-action {
				display: none !important;
			}

			body.presentation-print-mode #presentation-print-root [data-presentation-description-content] {
				max-height: none !important;
				overflow: visible !important;
				mask-image: none !important;
				-webkit-mask-image: none !important;
			}

			body.presentation-print-mode #presentation-print-root .presentation-effort-chart-image,
			body.presentation-print-mode #presentation-print-root .presentation-year-budget-chart-image,
			body.presentation-print-mode #presentation-print-root .presentation-batch-budget-chart-image,
			body.presentation-print-mode #presentation-print-root .presentation-batch-budget-share-chart-image {
				display: block;
				width: 100%;
				height: auto;
			}

			body.presentation-print-mode #presentation-print-root *,
			body.presentation-print-mode #presentation-print-root *::before,
			body.presentation-print-mode #presentation-print-root *::after {
				box-shadow: none !important;
				filter: none !important;
			}

			@media print {
				body.presentation-print-mode > *:not(#presentation-print-root) {
					display: none !important;
				}

				body.presentation-print-mode #presentation-print-root {
					display: block !important;
					padding: 24px;
					background: white !important;
				}

				body.presentation-print-mode #presentation-print-root > section {
					break-after: page;
					page-break-after: always;
					box-shadow: none !important;
				}

				body.presentation-print-mode #presentation-print-root > section:last-child {
					break-after: auto;
					page-break-after: auto;
				}
			}
		`;
		document.getElementById('presentation-print-style')?.remove();
		document.head.appendChild(printStyle);

		const appRootElement = document.querySelector('app-root');
		if (appRootElement instanceof HTMLElement) {
			appRootElement.setAttribute('data-presentation-print-original-display', appRootElement.style.display);
			appRootElement.style.display = 'none';
		}

		document.body.classList.add('presentation-print-mode');
		document.body.classList.toggle('presentation-print-with-descriptions', includeDescriptions);
		window.setTimeout(() => window.print(), 50);
	}

	scrollToSlide(id: string) {
		const element = document.getElementById(`presentation-slide-${id}`);
		element?.scrollIntoView({ behavior: 'smooth', block: 'start' });
	}

	scrollToUpdate(updateId: string, activityId: string | null = null) {
		const updateElement = document.getElementById(`presentation-update-${updateId}`);
		if (!updateElement && activityId) {
			this.scrollToSlide(activityId);
			return;
		}
		if (!updateElement) return;
		this.highlightedUpdateId.set(updateId);
		updateElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
		window.setTimeout(() => {
			if (this.highlightedUpdateId() === updateId) {
				this.highlightedUpdateId.set(null);
			}
		}, 4500);
	}

	goToContributor(contributorId: string) {
		this._contributorsRepository.goToContributor(contributorId);
	}

	goToCustomer(customerId: string) {
		this._customersRepository.goToCustomer(customerId);
	}

	goToDeliverable(deliverableId: string) {
		this._deliverablesRepository.goToDeliverable(deliverableId);
	}

	addActivityProposal(activityId: string) {
		const detailedActivity = this.detailedActivities().find((item) => item.activity.id === activityId);
		if (!detailedActivity) return;
		const proposals = [
			...(detailedActivity.activity.config?.proposals ?? []),
			{
				id: crypto.randomUUID(),
				kind: 'question' as const,
				date: new Date(),
				title: 'Point à discuter',
				content: '<p>À compléter</p>',
				answerContent: '',
				fileIds: [],
				links: [],
			},
		];
		this._activitiesRepository.store
			.applyPatch(activityId, {
				config: {
					...(detailedActivity.activity.config ?? {}),
					proposals,
				},
			})
			.subscribe();
	}

	updateActivityProposalField(activityId: string, proposalId: string, field: keyof ActivityProposal, value: string | boolean) {
		const detailedActivity = this.detailedActivities().find((item) => item.activity.id === activityId);
		if (!detailedActivity) return;
		const proposals = (detailedActivity.activity.config?.proposals ?? []).map((proposal) => {
			if (proposal.id !== proposalId) return proposal;
			return {
				...proposal,
				[field]: value,
			};
		});
		this._activitiesRepository.store
			.applyPatch(activityId, {
				config: {
					...(detailedActivity.activity.config ?? {}),
					proposals,
				},
			})
			.subscribe();
	}

	openUpdateFile(file: EntityFile) {
		this._fileModals.openEntityFileDisplayDialog(file);
	}

	openProposalFile(file: EntityFile) {
		this._fileModals.openEntityFileDisplayDialog(file);
	}

	goToActivityUpdate(activityId: string, updateId: string) {
		this._activitiesRepository.goToActivity(activityId, { updateId });
	}

	goToActivityProposal(activityId: string, proposalId: string) {
		this._activitiesRepository.goToActivity(activityId, { proposalId });
	}

	formatKeur(value: number | null | undefined) {
		return `${(value ?? 0).toFixed(1)} k€`;
	}

	getActivitySummaryCostLabel() {
		const year = this.selectedYear() ?? this.budgetYear();
		return year === null ? 'Budget activité' : `Budget ${year}`;
	}

	getActivitySummaryCostKeur(slide: PresentationSlide) {
		const year = this.selectedYear() ?? this.budgetYear();
		if (year === null) return slide.totalCostKeur ?? 0;
		return slide.yearlyCostsKeur?.[year] ?? 0;
	}

	getSlideDomId(slideId: string) {
		return `presentation-slide-${slideId}`;
	}

	getSlideNumber(slideId: string) {
		const index = this.slideOrder().indexOf(slideId);
		return index >= 0 ? index + 1 : 0;
	}

	formatDate(value?: string) {
		if (!value) return '—';
		const date = new Date(value);
		if (Number.isNaN(date.getTime())) return value;
		return date.toLocaleDateString('fr-FR');
	}

	private _getStaticSlideDefinition(id: string) {
		const definition = PRESENTATION_STATIC_SLIDE_DEFINITIONS.find((slideDefinition) => slideDefinition.id === id);
		if (definition) return definition;

		throw new Error(`Unknown presentation slide definition: ${id}`);
	}

	private _applyIncludedSlideIds(baseSlides: PresentationSlide[], includedSlideIds: string[] | null) {
		if (includedSlideIds === null || includedSlideIds.length === 0) return baseSlides;
		return baseSlides.filter((slide) => includedSlideIds.includes(slide.id));
	}

	private _applyOrderedSlideIds(baseSlides: PresentationSlide[], orderedSlideIds: string[]) {
		if (orderedSlideIds.length === 0) return baseSlides;

		const slidesById = new Map(baseSlides.map((slide) => [slide.id, slide]));
		const orderedSlides = orderedSlideIds.map((slideId) => slidesById.get(slideId)).filter((slide): slide is PresentationSlide => slide !== undefined);
		const remainingSlides = baseSlides.filter((slide) => !orderedSlideIds.includes(slide.id));
		return [...orderedSlides, ...remainingSlides];
	}

	private _insertCustomSlides(baseSlides: PresentationSlide[], customSlides: ProjectPresentationCustomSlide[]) {
		let slides = [...baseSlides];
		for (const customSlideDefinition of customSlides) {
			slides = this._insertCustomSlide(slides, {
				id: customSlideDefinition.id,
				kind: 'custom',
				label: customSlideDefinition.label,
				title: customSlideDefinition.title,
				subtitle: customSlideDefinition.subtitle,
				bodyHtml: customSlideDefinition.bodyHtml,
				bodyLines: customSlideDefinition.bodyLines ?? [],
				includeInToc: customSlideDefinition.includeInToc ?? true,
				showNumber: customSlideDefinition.showNumber ?? true,
				beforeSlideId: customSlideDefinition.beforeSlideId,
				afterSlideId: customSlideDefinition.afterSlideId,
			});
		}

		return slides;
	}

	private _insertCustomSlide(slides: PresentationSlide[], customSlide: PresentationSlide) {
		if (slides.some((existingSlide) => existingSlide.id === customSlide.id)) {
			return slides;
		}

		if (customSlide.beforeSlideId) {
			const beforeSlideIndex = slides.findIndex((slide) => slide.id === customSlide.beforeSlideId);
			if (beforeSlideIndex >= 0) {
				return [...slides.slice(0, beforeSlideIndex), customSlide, ...slides.slice(beforeSlideIndex)];
			}
		}

		if (customSlide.afterSlideId) {
			const afterSlideIndex = slides.findIndex((slide) => slide.id === customSlide.afterSlideId);
			if (afterSlideIndex >= 0) {
				const insertionIndex = afterSlideIndex + 1;
				return [...slides.slice(0, insertionIndex), customSlide, ...slides.slice(insertionIndex)];
			}
		}

		return [...slides, customSlide];
	}

	private _computeOverviewTrend(fromValue: number, toValue: number): 'up' | 'down' | 'stable' {
		if (toValue > fromValue) return 'up';
		if (toValue < fromValue) return 'down';
		return 'stable';
	}

	private _getAdjustedActivityYearlyCosts(activityId: string, years: number[]) {
		const adjustedYearlyCosts = this._adjustedYearlyCostsByActivity().get(activityId) ?? {};
		return years.reduce<Record<number, number>>((acc, year) => {
			acc[year] = adjustedYearlyCosts[year] ?? 0;
			return acc;
		}, {});
	}

	private _replacePrintChartWithImage(printRoot: HTMLElement, selector: string, chartInstance: echarts.ECharts | null, alt: string, imageClassName: string) {
		const chartHost = printRoot.querySelector(selector);
		if (!(chartHost instanceof HTMLElement) || !chartInstance) return;
		const chartImage = document.createElement('img');
		chartImage.src = chartInstance.getDataURL({
			type: 'png',
			pixelRatio: 2,
			backgroundColor: '#ffffff',
		});
		chartImage.alt = alt;
		chartImage.className = imageClassName;
		chartHost.replaceWith(chartImage);
	}

	private _sumYearlyCosts(yearlyCosts: Record<number, number>) {
		return roundTo1(Object.values(yearlyCosts).reduce((sum, value) => sum + (value ?? 0), 0));
	}

	private _isFandaUsage(usage: AnnualFacilityUsage) {
		const facilityName = this._facilitiesById()[usage.facilityId]?.name ?? '';
		return facilityName.toUpperCase().includes('FANDA');
	}

	private _isLotZeroBatch(prefix?: string, title?: string) {
		const prefixValue = (prefix ?? '').trim().toUpperCase();
		if (prefixValue === 'L0' || prefixValue === '0') return true;
		const titleValue = (title ?? '').trim().toUpperCase();
		return titleValue.startsWith('L0') || titleValue.startsWith('LOT 0');
	}

	private _updateEffortTrackingChart() {
		if (!this._effortTrackingChartInstance) return;

		const effortTrackingSlide = this.effortTrackingSlide();
		if (effortTrackingSlide.year === null) {
			this._effortTrackingChartInstance.clear();
			return;
		}

		const effortTrackingChartOption: echarts.EChartsOption = {
			animationDuration: 1200,
			animationDurationUpdate: 800,
			tooltip: {
				trigger: 'axis',
				order: 'valueDesc',
				valueFormatter: (value) => `${Number(value).toFixed(1)} j`,
			},
			grid: {
				left: 56,
				right: 24,
				top: 16,
				bottom: 40,
			},
			xAxis: {
				type: 'category',
				data: effortTrackingSlide.monthLabels,
				boundaryGap: false,
				axisLine: {
					lineStyle: {
						color: 'color-mix(in oklab, var(--color-base-content) 22%, transparent)',
					},
				},
				axisLabel: {
					color: 'color-mix(in oklab, var(--color-base-content) 60%, transparent)',
				},
			},
			yAxis: {
				type: 'value',
				axisLabel: {
					formatter: (value) => `${Number(value).toFixed(0)} j`,
					color: 'color-mix(in oklab, var(--color-base-content) 52%, transparent)',
				},
				splitLine: {
					lineStyle: {
						color: 'color-mix(in oklab, var(--color-base-content) 12%, transparent)',
					},
				},
			},
			series: [
				{
					name: 'Réalisé cumulé',
					type: 'line',
					data: effortTrackingSlide.actualSeries,
					connectNulls: false,
					showSymbol: true,
					symbolSize: 7,
					lineStyle: {
						width: 4,
						color: '#0369a1',
					},
					itemStyle: {
						color: '#0369a1',
					},
				},
				{
					name: 'Projection linéaire',
					type: 'line',
					data: effortTrackingSlide.projectedSeries,
					connectNulls: false,
					showSymbol: true,
					symbolSize: 7,
					lineStyle: {
						width: 4,
						color: '#7dd3fc',
					},
					itemStyle: {
						color: '#7dd3fc',
					},
				},
				{
					name: 'Projection récente (2 mois)',
					type: 'line',
					data: effortTrackingSlide.recentProjectedSeries,
					connectNulls: false,
					showSymbol: true,
					symbolSize: 7,
					lineStyle: {
						width: 3,
						type: 'dotted',
						color: '#a78bfa',
					},
					itemStyle: {
						color: '#a78bfa',
					},
				},
				{
					name: 'Trajectoire théorique',
					type: 'line',
					data: effortTrackingSlide.theoreticalSeries,
					showSymbol: true,
					symbolSize: 6,
					lineStyle: {
						width: 3,
						type: 'dashed',
						color: '#fbbf24',
					},
					itemStyle: {
						color: '#fbbf24',
					},
				},
			],
		};

		this._effortTrackingChartInstance.setOption(effortTrackingChartOption, true);
		window.setTimeout(() => this._effortTrackingChartInstance?.resize(), 0);
	}

	private _updateBatchBudgetChart() {
		if (!this._batchBudgetChartInstance) return;

		const years = this.fullDisplayYears();
		const rows = this.batchBudgetRows();
		if (years.length === 0 || rows.length === 0) {
			this._batchBudgetChartInstance.clear();
			return;
		}

		const palette = ['#2563eb', '#0ea5e9', '#14b8a6', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];
		const batchBudgetChartOption: echarts.EChartsOption = {
			animationDuration: 900,
			animationDurationUpdate: 600,
			color: palette,
			tooltip: {
				trigger: 'axis',
				axisPointer: { type: 'shadow' },
				valueFormatter: (value) => `${Number(value).toFixed(1)} k€`,
			},
			legend: {
				top: 0,
				textStyle: {
					color: 'color-mix(in oklab, var(--color-base-content) 70%, transparent)',
				},
			},
			grid: {
				left: 56,
				right: 24,
				top: 52,
				bottom: 56,
			},
			xAxis: {
				type: 'category',
				data: rows.map((row) => row.label),
				axisLabel: {
					color: 'color-mix(in oklab, var(--color-base-content) 60%, transparent)',
				},
				axisLine: {
					lineStyle: {
						color: 'color-mix(in oklab, var(--color-base-content) 22%, transparent)',
					},
				},
			},
			yAxis: {
				type: 'value',
				axisLabel: {
					formatter: (value) => `${Number(value).toFixed(0)} k€`,
					color: 'color-mix(in oklab, var(--color-base-content) 52%, transparent)',
				},
				splitLine: {
					lineStyle: {
						color: 'color-mix(in oklab, var(--color-base-content) 12%, transparent)',
					},
				},
			},
			series: years.map((year, index) => ({
				name: String(year),
				type: 'bar',
				barMaxWidth: 28,
				emphasis: { focus: 'series' },
				itemStyle: {
					borderRadius: [8, 8, 0, 0],
					opacity: 0.92,
					color: palette[index % palette.length],
				},
				data: rows.map((row) => row.yearlyCostsKeur[year] ?? 0),
			})),
		};

		this._batchBudgetChartInstance.setOption(batchBudgetChartOption, true);
		window.setTimeout(() => this._batchBudgetChartInstance?.resize(), 0);
	}

	private _updateYearBudgetChart() {
		if (!this._yearBudgetChartInstance) return;

		const rows = this.yearBudgetRows();
		if (rows.length === 0) {
			this._yearBudgetChartInstance.clear();
			return;
		}

		const yearBudgetChartOption: echarts.EChartsOption = {
			animationDuration: 900,
			animationDurationUpdate: 600,
			tooltip: {
				trigger: 'axis',
				axisPointer: { type: 'shadow' },
				valueFormatter: (value) => `${Number(value).toFixed(1)} k€`,
			},
			grid: {
				left: 56,
				right: 24,
				top: 16,
				bottom: 40,
			},
			xAxis: {
				type: 'category',
				data: rows.map((row) => String(row.year)),
				axisLabel: {
					color: 'color-mix(in oklab, var(--color-base-content) 60%, transparent)',
				},
				axisLine: {
					lineStyle: {
						color: 'color-mix(in oklab, var(--color-base-content) 22%, transparent)',
					},
				},
			},
			yAxis: {
				type: 'value',
				axisLabel: {
					formatter: (value) => `${Number(value).toFixed(0)} k€`,
					color: 'color-mix(in oklab, var(--color-base-content) 52%, transparent)',
				},
				splitLine: {
					lineStyle: {
						color: 'color-mix(in oklab, var(--color-base-content) 12%, transparent)',
					},
				},
			},
			series: [
				{
					type: 'bar',
					barMaxWidth: 46,
					data: rows.map((row) => row.totalCostKeur),
					itemStyle: {
						color: '#2563eb',
						borderRadius: [10, 10, 0, 0],
					},
				},
			],
		};

		this._yearBudgetChartInstance.setOption(yearBudgetChartOption, true);
		window.setTimeout(() => this._yearBudgetChartInstance?.resize(), 0);
	}

	private _updateBatchBudgetShareChart() {
		if (!this._batchBudgetShareChartInstance) return;

		const rows = this.batchBudgetRows().filter((row) => row.totalCostKeur > 0);
		if (rows.length === 0) {
			this._batchBudgetShareChartInstance.clear();
			return;
		}

		const palette = ['#2563eb', '#0ea5e9', '#14b8a6', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];
		const batchBudgetShareChartOption: echarts.EChartsOption = {
			animationDuration: 900,
			animationDurationUpdate: 600,
			color: palette,
			tooltip: {
				trigger: 'item',
				valueFormatter: (value) => `${Number(value).toFixed(1)} k€`,
			},
			legend: {
				orient: 'vertical',
				right: 0,
				top: 'middle',
				textStyle: {
					color: 'color-mix(in oklab, var(--color-base-content) 70%, transparent)',
				},
			},
			series: [
				{
					type: 'pie',
					radius: ['40%', '72%'],
					center: ['38%', '50%'],
					avoidLabelOverlap: true,
					itemStyle: {
						borderColor: '#fff',
						borderWidth: 3,
					},
					label: {
						formatter: '{b}\n{d}%',
						color: 'color-mix(in oklab, var(--color-base-content) 78%, transparent)',
					},
					data: rows.map((row) => ({
						name: row.label,
						value: row.totalCostKeur,
					})),
				},
			],
		};

		this._batchBudgetShareChartInstance.setOption(batchBudgetShareChartOption, true);
		window.setTimeout(() => this._batchBudgetShareChartInstance?.resize(), 0);
	}

	private _handleChartsResize = () => {
		this._effortTrackingChartInstance?.resize();
		this._yearBudgetChartInstance?.resize();
		this._batchBudgetChartInstance?.resize();
		this._batchBudgetShareChartInstance?.resize();
	};

	private _computeCostByYearKeur(
		contributions: AnnualContribution[],
		facilityUsages: AnnualFacilityUsage[],
		purchases: Purchase[],
		contributorCategories: Record<string, CategoryEnum | null>,
		years: number[]
	) {
		const yearlyCosts = years.reduce(
			(acc, year) => {
				acc[year] = 0;
				return acc;
			},
			{} as Record<number, number>
		);

		for (const contribution of contributions) {
			const billed = this._projectCostService.getContributionBilledAmountKeur(contribution, contributorCategories[contribution.contributorId] ?? null);
			yearlyCosts[contribution.year] = Math.round(((yearlyCosts[contribution.year] ?? 0) + (billed ?? 0)) * 10) / 10;
		}

		for (const usage of facilityUsages) {
			const billed = this._projectCostService.getFacilityUsageBilledAmountKeur(usage);
			yearlyCosts[usage.year] = Math.round(((yearlyCosts[usage.year] ?? 0) + (billed ?? 0)) * 10) / 10;
		}

		for (const purchase of purchases) {
			const billed = this._projectCostService.getPurchaseBilledAmountKeur(purchase);
			yearlyCosts[purchase.year] = Math.round(((yearlyCosts[purchase.year] ?? 0) + (billed ?? 0)) * 10) / 10;
		}

		return yearlyCosts;
	}

	private _buildContributorNames(contributions: AnnualContribution[], contributorsById: Record<string, Contributor | null>) {
		const seen = new Set<string>();
		const names: { id: string; label: string }[] = [];

		for (const contribution of contributions) {
			if (!contribution.contributorId || seen.has(contribution.contributorId)) continue;
			const contributor = contributorsById[contribution.contributorId];
			if (contributor?.config?.groupManager) continue;
			seen.add(contribution.contributorId);
			names.push({
				id: contribution.contributorId,
				label: this._getContributorDisplayName(contributor, contribution.contributorId),
			});
		}

		return names.sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }));
	}

	private _formatProjectPeriod(project: Project | null) {
		if (!project?.startDate && !project?.endDate) return '—';
		return `${this.formatDate(project?.startDate)} → ${this.formatDate(project?.endDate)}`;
	}

	private _buildCustomerNames(detailedActivity: DetailedActivity, customersById: Record<string, Customer | null>) {
		const seen = new Set<string>();
		const names: { id: string; label: string }[] = [];

		for (const deliverable of detailedActivity.deliverables) {
			if (deliverable.hidden) continue;
			const customerId = deliverable.customerId;
			if (!customerId || seen.has(customerId)) continue;
			seen.add(customerId);
			names.push({
				id: customerId,
				label: this._getCustomerDisplayName(customersById[customerId], customerId),
			});
		}

		return names.sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }));
	}

	private _buildPrincipalDeliverables(detailedActivity: DetailedActivity) {
		return detailedActivity.deliverables
			.filter((deliverable) => !deliverable.hidden && deliverable.isPrincipal)
			.map((deliverable) => ({
				id: deliverable.id,
				title: deliverable.title || 'Livrable sans titre',
				dueDateLabel: this._formatDeliverableDueDate(deliverable.contractualEndDate ?? deliverable.endDate),
			}))
			.sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }));
	}

	private _formatDeliverableDueDate(value?: string) {
		if (!value) return 'Échéance non définie';
		return `Échéance : ${this.formatDate(value)}`;
	}

	private _buildVisibleProposals(proposals: ActivityProposal[], selectedYear: number | null) {
		const filtered = selectedYear === null ? proposals : proposals.filter((proposal) => this._isProposalVisibleForYear(proposal, selectedYear));
		return [...filtered].sort((a, b) => this._getProposalTimestamp(a) - this._getProposalTimestamp(b));
	}

	private _isProposalVisibleForYear(proposal: ActivityProposal, year: number) {
		if (!proposal.date) return true;
		return new Date(proposal.date).getFullYear() === year;
	}

	private _getProposalTimestamp(proposal: ActivityProposal) {
		if (!proposal.date) return 0;
		return new Date(proposal.date).getTime();
	}

	private _buildVisibleUpdates(updates: ActivityUpdate[], selectedYear: number | null) {
		const filtered = selectedYear === null ? updates : updates.filter((update) => this._isUpdateVisibleForYear(update, selectedYear));
		return [...filtered].sort((a, b) => this._getUpdateTimestamp(a) - this._getUpdateTimestamp(b));
	}

	private _isUpdateVisibleForYear(update: ActivityUpdate, year: number) {
		if (!update.date) return true;
		return new Date(update.date).getFullYear() === year;
	}

	private _getUpdateTimestamp(update: ActivityUpdate) {
		if (!update.date) return 0;
		return new Date(update.date).getTime();
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

	private _formatProposalKind(kind?: ActivityProposal['kind']) {
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

	private _computeYearlyCostTrends(yearlyCostsKeur: Record<number, number>, years: number[]) {
		const trends: Record<number, 'up' | 'down' | 'stable' | null> = {};

		for (const [index, year] of years.entries()) {
			if (index === 0) {
				trends[year] = null;
				continue;
			}

			const previousYear = years[index - 1];
			const currentValue = yearlyCostsKeur[year] ?? 0;
			const previousValue = yearlyCostsKeur[previousYear] ?? 0;

			if (currentValue > previousValue) {
				trends[year] = 'up';
				continue;
			}
			if (currentValue < previousValue) {
				trends[year] = 'down';
				continue;
			}
			trends[year] = 'stable';
		}

		return trends;
	}


	private _computeCostKeur(
		contributions: AnnualContribution[],
		facilityUsages: AnnualFacilityUsage[],
		purchases: Purchase[],
		contributorCategories: Record<string, CategoryEnum | null>
	) {
		let total = 0;

		for (const contribution of contributions) {
			const billed = this._projectCostService.getContributionBilledAmountKeur(contribution, contributorCategories[contribution.contributorId] ?? null);
			total += billed ?? 0;
		}

		for (const usage of facilityUsages) {
			const billed = this._projectCostService.getFacilityUsageBilledAmountKeur(usage);
			total += billed ?? 0;
		}

		for (const purchase of purchases) {
			const billed = this._projectCostService.getPurchaseBilledAmountKeur(purchase);
			total += billed ?? 0;
		}

		return Math.round(total * 10) / 10;
	}

	private _getContributorDisplayName(contributor: Contributor | null | undefined, fallbackId: string) {
		if (!contributor) return fallbackId;
		const fullName = `${contributor.firstName ?? ''} ${contributor.lastName ?? ''}`.trim();
		if (fullName) return fullName;
		if (contributor.email) return contributor.email;
		return contributor.id || fallbackId;
	}

	private _getCustomerDisplayName(customer: Customer | null | undefined, fallbackId: string) {
		if (!customer) return fallbackId;
		const fullName = `${customer.firstName ?? ''} ${customer.lastName ?? ''}`.trim();
		if (fullName && customer.unit) return `${fullName} (${customer.unit})`;
		if (fullName) return fullName;
		if (customer.unit) return customer.unit;
		if (customer.identifier) return customer.identifier;
		return customer.id || fallbackId;
	}

	private _getEffortTrackingReferenceYear() {
		const selectedYear = this.selectedYear();
		if (selectedYear !== null) return selectedYear;

		const yearsFromFollowup = (this.costFollowupData()?.months ?? [])
			.map((month) => Number.parseInt(month.slice(0, 4), 10))
			.filter((year) => Number.isFinite(year));
		if (yearsFromFollowup.length > 0) {
			return Math.max(...yearsFromFollowup);
		}

		const displayYears = this.displayYears();
		return displayYears.length > 0 ? displayYears[displayYears.length - 1] : null;
	}
}

function roundTo1(value: number): number {
	return Math.round(value * 10) / 10;
}
