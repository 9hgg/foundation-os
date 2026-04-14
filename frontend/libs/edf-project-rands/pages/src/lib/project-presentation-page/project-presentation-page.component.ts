import { ChangeDetectionStrategy, Component, ElementRef, computed, effect, inject, signal, viewChild } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import {
	Activity,
	AnnualContribution,
	AnnualFacilityUsage,
	Batch,
	CategoryEnum,
	Contributor,
	Customer,
	Deliverable,
	Project,
	ProjectCostTrackingData,
	ProjectPresentationCatalog,
	Purchase,
} from '@edf/edf-project-rands/models';
import { ContributorsRepository, CustomersRepository } from '@edf/edf-project-rands/state';
import { DetailedActivity } from '@edf/edf-project-rands/ui';
import { EntityFile } from '@foundation/files/models';
import { FilesRepository } from '@foundation/files/state';
import { RequestService } from '@foundation/network/services';
import { map, of, switchMap } from 'rxjs';
import { ProjectPresentationTabComponent } from '../project-builder-page/project-presentation-tab/project-presentation-tab.component';

// ------- Snapshot interfaces (mirror the Python PresentationSnapshot models) -------

interface PresentationDeliverableSnapshot {
	deliverable: Deliverable;
	customer: Customer | null;
}

interface PresentationContributionSnapshot {
	contribution: AnnualContribution;
	contributor: Contributor;
}

interface PresentationFacilityUsageSnapshot {
	facilityUsage: AnnualFacilityUsage;
	facility: { id: string; name: string };
}

interface PresentationActivitySnapshot {
	activity: Activity;
	deliverables: PresentationDeliverableSnapshot[];
	contributions: PresentationContributionSnapshot[];
	facilityUsages: PresentationFacilityUsageSnapshot[];
	purchases: Purchase[];
}

interface PresentationBatchSnapshot {
	batch: Batch;
	activities: PresentationActivitySnapshot[];
}

interface PresentationSnapshot {
	project: Project;
	catalog: ProjectPresentationCatalog;
	mainCustomer: Customer | null;
	sponsorCustomer: Customer | null;
	projectManager: Contributor | null;
	strategicLead: Contributor | null;
	batches: PresentationBatchSnapshot[];
	costTrackingData: ProjectCostTrackingData | null;
	files: Record<string, EntityFile>;
}

// ------- Component -------

@Component({
	selector: 'lib-project-presentation-page',
	imports: [ProjectPresentationTabComponent],
	templateUrl: './project-presentation-page.component.html',
	styleUrl: './project-presentation-page.component.css',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProjectPresentationPageComponent {
	private _route = inject(ActivatedRoute);
	private _requestService = inject(RequestService);
	private _contributorsRepository = inject(ContributorsRepository);
	private _customersRepository = inject(CustomersRepository);
	private _filesRepository = inject(FilesRepository);

	private _scrollContainer = viewChild<ElementRef<HTMLElement>>('scrollContainer');

	constructor() {
		// The presentation tab's chart effects use queueMicrotask, causing layout shifts
		// after the initial render. We reset the scroll position once the snapshot has loaded,
		// after all microtasks have settled, so the user always starts at the top.
		effect(() => {
			if (!this._snapshot()) return;
			const container = this._scrollContainer();
			if (!container) return;
			setTimeout(() => {
				container.nativeElement.scrollTop = 0;
				setTimeout(() => {
					container.nativeElement.scrollTop = 0;
				}, 100);
			}, 0);
		});

		// Pre-populate the contributor, customer, and file stores from the snapshot so the
		// presentation tab can resolve names and thumbnails without making authenticated CRUD requests.
		effect(() => {
			const snapshot = this._snapshot();
			if (!snapshot) return;

			for (const batchSnapshot of snapshot.batches) {
				for (const activitySnapshot of batchSnapshot.activities) {
					for (const contributionSnapshot of activitySnapshot.contributions) {
						this._contributorsRepository.store.upsertObjectLocally(contributionSnapshot.contributor);
					}
					for (const deliverableSnapshot of activitySnapshot.deliverables) {
						if (deliverableSnapshot.customer) {
							this._customersRepository.store.upsertObjectLocally(deliverableSnapshot.customer);
						}
					}
				}
			}

			for (const file of Object.values(snapshot.files)) {
				this._filesRepository.store.upsertObjectLocally(file);
			}
		});
	}

	// Route params
	private _projectId = toSignal(this._route.paramMap.pipe(map((p) => p.get('projectId'))), { initialValue: null });
	private _presentationId = toSignal(this._route.paramMap.pipe(map((p) => p.get('presentationId'))), { initialValue: null });

	// Fetch the snapshot from the backend.
	// Note: this endpoint returns EndpointOutput[PresentationSnapshot] where result IS the snapshot
	// directly (not wrapped in { data: ... } like CRUD list endpoints).
	private _snapshotResponse = toSignal(
		this._route.paramMap.pipe(
			map((params) => ({ projectId: params.get('projectId'), presentationId: params.get('presentationId') })),
			switchMap(({ projectId, presentationId }) => {
				if (!projectId || !presentationId) return of(null);
				return this._requestService.getBasic$<PresentationSnapshot>(
					`/api/edf/rand/projects/${projectId}/presentations/${presentationId}/snapshot`
				);
			})
		),
		{ initialValue: null }
	);

	isLoading = computed(() => this._snapshotResponse() === null);
	hasError = computed(() => {
		const response = this._snapshotResponse();
		return response !== null && !!response.error;
	});

	private _snapshot = computed((): PresentationSnapshot | null => {
		const response = this._snapshotResponse();
		if (!response?.result) return null;
		return response.result;
	});

	// ------- Data derived from snapshot -------

	project = computed((): Project | null => this._snapshot()?.project ?? null);

	mainCustomerDisplayName = computed((): string => {
		const customer = this._snapshot()?.mainCustomer;
		if (!customer) return '';
		const fullName = `${customer.firstName ?? ''} ${customer.lastName ?? ''}`.trim();
		return customer.unit ? `${fullName} (${customer.unit})` : fullName;
	});

	sponsorCustomerDisplayName = computed((): string => {
		const customer = this._snapshot()?.sponsorCustomer;
		if (!customer) return '';
		return `${customer.firstName ?? ''} ${customer.lastName ?? ''}`.trim();
	});

	projectManagerDisplayName = computed((): string => {
		const contributor = this._snapshot()?.projectManager;
		if (!contributor) return '';
		return `${contributor.firstName ?? ''} ${contributor.lastName ?? ''}`.trim();
	});

	strategicLeadDisplayName = computed((): string => {
		const contributor = this._snapshot()?.strategicLead;
		if (!contributor) return '';
		return `${contributor.firstName ?? ''} ${contributor.lastName ?? ''}`.trim();
	});

	// Flat list of all annual contributions across all activities
	contributions = computed((): AnnualContribution[] =>
		this._snapshot()?.batches.flatMap((batchSnapshot) =>
			batchSnapshot.activities.flatMap((activitySnapshot) =>
				activitySnapshot.contributions.map((contributionSnapshot) => contributionSnapshot.contribution)
			)
		) ?? []
	);

	// Flat list of all purchases across all activities
	purchases = computed((): Purchase[] =>
		this._snapshot()?.batches.flatMap((batchSnapshot) =>
			batchSnapshot.activities.flatMap((activitySnapshot) => activitySnapshot.purchases)
		) ?? []
	);

	// Flat list of all facility usages across all activities
	facilityUsages = computed((): AnnualFacilityUsage[] =>
		this._snapshot()?.batches.flatMap((batchSnapshot) =>
			batchSnapshot.activities.flatMap((activitySnapshot) =>
				activitySnapshot.facilityUsages.map((facilityUsageSnapshot) => facilityUsageSnapshot.facilityUsage)
			)
		) ?? []
	);

	// Map: contributorId -> category (used for cost calculation)
	contributorCategories = computed((): Record<string, CategoryEnum | null> => {
		const snapshot = this._snapshot();
		if (!snapshot) return {};
		const categories: Record<string, CategoryEnum | null> = {};
		for (const batchSnapshot of snapshot.batches) {
			for (const activitySnapshot of batchSnapshot.activities) {
				for (const contributionSnapshot of activitySnapshot.contributions) {
					const contributorId = contributionSnapshot.contributor.id;
					categories[contributorId] = contributionSnapshot.contributor.category ?? null;
				}
			}
		}
		return categories;
	});

	// DetailedActivity[] built from the snapshot — mirrors what the project builder does
	detailedActivities = computed((): DetailedActivity[] => {
		const snapshot = this._snapshot();
		if (!snapshot) return [];

		const allDetailedActivities: DetailedActivity[] = snapshot.batches.flatMap((batchSnapshot) =>
			batchSnapshot.activities.map((activitySnapshot) => {
				const batch: Batch = batchSnapshot.batch;
				const activity: Activity = activitySnapshot.activity;
				const deliverables: Deliverable[] = activitySnapshot.deliverables.map((d) => d.deliverable);

				const batchPrefix = batch.prefix ?? '';
				const activityPrefix = activity.prefix ?? '';
				const mergedPrefix = batchPrefix && activityPrefix ? `${batchPrefix}.${activityPrefix}` : batchPrefix || activityPrefix || '';

				return {
					id: activity.id,
					batch,
					activity,
					deliverables,
					mergedPrefix,
					mergedPrefixSort: this._buildPrefixSortKey(mergedPrefix),
					batchPrefix,
					activityPrefix,
					activityTitle: activity.title ?? '',
					batchPrefixSort: this._buildPrefixSortKey(batchPrefix),
					activityPrefixSort: this._buildPrefixSortKey(activityPrefix),
				} satisfies DetailedActivity;
			})
		);

		return [...allDetailedActivities].sort((a, b) => this._compareDetailedActivitiesByPrefix(a, b));
	});

	// Project years (startDate → endDate)
	projectYears = computed((): number[] => {
		const project = this._snapshot()?.project;
		if (!project?.startDate || !project?.endDate) return [];
		const startYear = new Date(project.startDate).getFullYear();
		const endYear = new Date(project.endDate).getFullYear();
		if (!Number.isFinite(startYear) || !Number.isFinite(endYear) || endYear < startYear) return [];
		const years: number[] = [];
		for (let year = startYear; year <= endYear; year++) years.push(year);
		return years;
	});

	// Catalog-specific inputs for the presentation tab
	catalogCustomSlides = computed(() => this._snapshot()?.catalog.customSlides ?? []);
	catalogOrderedSlideIds = computed(() => this._snapshot()?.catalog.orderedSlideIds ?? []);
	catalogIncludedSlideIds = computed(() => {
		const ids = this._snapshot()?.catalog.includedSlideIds;
		return ids && ids.length > 0 ? ids : null;
	});
	catalogHiddenSlideIds = computed(() => this._snapshot()?.catalog.hiddenSlideIds ?? []);
	catalogIncludedActivityIds = computed(() => {
		const ids = this._snapshot()?.catalog.includedActivityIds;
		return ids && ids.length > 0 ? ids : null;
	});
	catalogSelectedYears = computed(() => {
		const years = this._snapshot()?.catalog.selectedYears;
		return years && years.length > 0 ? years : null;
	});

	// Local mutable state for the presentation tab
	costTrackingData = computed((): ProjectCostTrackingData | null => this._snapshot()?.costTrackingData ?? null);

	selectedYear = signal<number | null>(null);
	focusMode = signal(false);

	// ------- Helpers -------

	private _buildPrefixSortKey(prefix?: string): string {
		const value = (prefix ?? '').trim();
		if (!value) return 'zzzzzzzz';
		return value.replace(/\d+/g, (digits) => digits.padStart(8, '0')).toLowerCase();
	}

	private _compareDetailedActivitiesByPrefix(a: DetailedActivity, b: DetailedActivity): number {
		const batchOrder = this._comparePrefixValues(a.batch.prefix, b.batch.prefix);
		if (batchOrder !== 0) return batchOrder;
		return this._comparePrefixValues(a.activity.prefix, b.activity.prefix);
	}

	private _comparePrefixValues(aPrefix?: string, bPrefix?: string): number {
		const a = (aPrefix ?? '').trim();
		const b = (bPrefix ?? '').trim();
		if (!a && !b) return 0;
		if (!a) return 1;
		if (!b) return -1;
		return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
	}
}
