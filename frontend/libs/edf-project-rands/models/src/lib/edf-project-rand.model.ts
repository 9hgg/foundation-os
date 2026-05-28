import { Resource } from '@foundation/utils';

/** Overhead coefficients per year or 'coefficient d'environnement' */
export const OVERHEAD_COEFFICIENTS: Record<string, number> = {
	2025: 1.38,
	2026: 1.38,
	2027: 1.38,
	2028: 1.38,
	2029: 1.38,
	2030: 1.38,
	2031: 1.38,
};

const BASE_DAILY_COSTS_2025: Record<string, number> = {
	A: 378.297317674931,
	B: 512.009535280088,
	C: 662.633480332589,
	D: 957.945100651881,
	E: 1211.15072768041,
};

const CATEGORY_DAILY_COST_MAPPING: Record<number, Record<string, number>> = {
	2025: BASE_DAILY_COSTS_2025,
	2026: BASE_DAILY_COSTS_2025,
	2027: BASE_DAILY_COSTS_2025,
	2028: BASE_DAILY_COSTS_2025,
	2029: BASE_DAILY_COSTS_2025,
	2030: BASE_DAILY_COSTS_2025,
	2031: BASE_DAILY_COSTS_2025,
};

export function getOverheadCoefficient(year: number): number {
	const overhead_coefficient = OVERHEAD_COEFFICIENTS[year.toString()];
	if (!overhead_coefficient) {
		throw new Error(`No overhead coefficient found for year ${year}`);
	}
	return overhead_coefficient;
}
export function getDailyCostForCategory(year: number, category: CategoryEnum): number {
	const yearMapping = CATEGORY_DAILY_COST_MAPPING[year];
	if (!yearMapping) {
		throw new Error(`No daily cost mapping found for year ${year}`);
	}
	const dailyCost = yearMapping[category];
	if (dailyCost === undefined) {
		throw new Error(`No daily cost found for category ${category} in year ${year}`);
	}
	return dailyCost;
}
export function getDailyCostWithOverhead(year: number, category: CategoryEnum): number {
	const dailyCost = getDailyCostForCategory(year, category);
	const overheadCoefficient = getOverheadCoefficient(year);
	return dailyCost * overheadCoefficient;
}

export enum CategoryEnum {
	A = 'A',
	B = 'B',
	C = 'C',
	D = 'D',
	E = 'E',
}

export enum FacilityTypeEnum {
	TESTING = 'testing',
	TRANSVERSE = 'transverse',
}

export interface ProjectBasicDataType {
	key: string;
	title: string;
	kind: 'text' | 'textarea' | 'quill' | 'select' | 'multiselect' | 'date' | string;
	content: any;
}

export interface ReportConfig {
	title: string;
	description?: string;
	localSyncPath?: string;
	template?: string;
	templates?: Record<string, TemplateData>;
	data: Record<string, ProjectBasicDataType>;
	pdfOptions?: Record<string, unknown>;
}

export interface TemplateData {
	key: string;
	title: string;
	content: unknown;
}

export interface ProjectPresentationCustomSlide {
	id: string;
	label: string;
	title: string;
	subtitle?: string;
	bodyHtml?: string;
	bodyLines?: string[];
	includeInToc?: boolean;
	showNumber?: boolean;
	catalogSlideId?: string;
	beforeSlideId?: string;
	afterSlideId?: string;
}

export interface ProjectPresentationSlideCatalogEntry {
	id: string;
	label: string;
	title: string;
	subtitle?: string;
	bodyHtml?: string;
	bodyLines?: string[];
	includeInToc?: boolean;
	showNumber?: boolean;
}

export interface ProjectPresentationCatalog {
	id: string;
	title: string;
	description?: string;
	selectedYears?: number[];
	includedBatchIds?: string[];
	includedActivityIds?: string[];
	orderedSlideIds?: string[];
	includedSlideIds?: string[];
	hiddenSlideIds?: string[];
	customSlides?: ProjectPresentationCustomSlide[];
}

export interface ProjectConfig {
	mainCustomerId?: string;
	sponsorCustomerId?: string;
	projectManagerContributorId?: string;
	strategicLeadContributorId?: string;
	costTrackingFileId?: string;
	reportConfigs?: Record<string, ReportConfig>;
	presentationCatalogs?: ProjectPresentationCatalog[];
	presentationSlideCatalog?: ProjectPresentationSlideCatalogEntry[];
	extraProperties?: Record<string, ProjectBasicDataType>;
}

export interface Project extends Resource {
	name: string;
	code: string;
	description?: string;
	startDate?: string;
	endDate?: string;
	config: ProjectConfig;
}

export interface Contributor extends Resource {
	firstName?: string;
	lastName?: string;
	email?: string;
	category?: CategoryEnum;
	unit?: string;
	department?: string;
	group?: string;
	NNI?: string;
	config?: ContributorConfig;
}

export interface ContributorConfig {
	groupManager?: string;
}

export interface ContributorPreviewRow {
	excel_name: string;
	first?: string;
	last?: string;
	nni?: string | null;
	inferred_category?: string | null;
	inferred_group?: string | null;
	matched_contributor_id?: string | null;
	state?: 'matched' | 'new' | string | null;
}

export interface Facility extends Resource {
	name: string;
	type: FacilityTypeEnum;
}

export interface Customer extends Resource {
	firstName?: string;
	lastName?: string;
	unit?: string;
	identifier?: string;
	referentId?: string;
	technicalReferentId?: string;
}

export interface Batch extends Resource {
	title: string;
	description?: string;
	prefix?: string;
	projectId: string;
}

export interface Deliverable extends Resource {
	title: string;
	description?: string;
	startDate?: string;
	endDate?: string;
	contractualEndDate?: string;
	isPrincipal: boolean;
	hidden?: boolean;
	customerId?: string;
}

export interface AnnualContribution extends Resource {
	activityId: string;
	contributorId: string;
	year: number;
	days: number;
}

export interface AnnualFacilityUsage extends Resource {
	activityId: string;
	facilityId: string;
	year: number;
	cost: number;
}

export interface ActivityUpdate {
	id: string;
	date?: Date;
	sourceKind: string;
	sourceName?: string;
	fileIds?: string[];
	links?: ActivityUpdateLink[];
	title?: string;
	content: string;
}

export interface ActivityUpdateLink {
	title: string;
	url: string;
}

export type ActivityProposalKind = 'inflexion' | 'question' | 'proposal';

export interface ActivityProposal {
	id: string;
	kind: ActivityProposalKind;
	date?: Date;
	title?: string;
	content: string;
	answerContent?: string;
	answered?: boolean;
	fileIds?: string[];
	links?: ActivityUpdateLink[];
}

export interface ActivityConfig {
	updates?: ActivityUpdate[];
	proposals?: ActivityProposal[];
}

export interface Activity extends Resource {
	title?: string;
	prefix?: string;
	description?: string;
	batchId: string;
	priority: number;
	isCorporate: boolean;
	isConfirmed: boolean;
	hidden?: boolean;
	/** Valeurs crées */
	finality?: string;
	strategicInterests?: string;
	synergies?: string;
	risks?: string;
	parades?: string;
	tags: string[];
	config?: ActivityConfig;
}

export interface ActivityDeliverable extends Resource {
	activityId: string;
	deliverableId: string;
}

export interface Purchase extends Resource {
	title: string;
	year: number;
	description?: string;
	supplier?: string;
	details?: string;
	minEstimatedCost?: number;
	estimatedCost?: number;
	maxEstimatedCost?: number;
	activityId: string;
}

export interface ProjectCostTrackingContributorSeries {
	contributorKey: string;
	contributorName: string;
	contributorId?: string | null;
	nni?: string | null;
	monthlyHours: Record<string, number>;
	totalHours: number;
}

export interface ProjectCostTrackingData {
	fileId: string;
	projectCode: string;
	months: string[];
	contributors: ProjectCostTrackingContributorSeries[];
	totalHoursByMonth: Record<string, number>;
	totalHours: number;
}
