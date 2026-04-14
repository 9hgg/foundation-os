import { Injectable, inject } from '@angular/core';
import {
	Activity,
	ActivityDeliverable,
	AnnualContribution,
	AnnualFacilityUsage,
	Batch,
	Contributor,
	Customer,
	Deliverable,
	Facility,
	Project,
	Purchase,
} from '@edf/edf-project-rands/models';
import {
	ActivitiesRepository,
	ActivityDeliverablesRepository,
	AnnualContributionsRepository,
	AnnualFacilityUsagesRepository,
	BatchesRepository,
	ContributorsRepository,
	CustomersRepository,
	DeliverablesRepository,
	FacilitiesRepository,
	ProjectsRepository,
	PurchasesRepository,
} from '@edf/edf-project-rands/state';
import { PaginatedResponse, RequestResponse, RequestService, SimpleResponse } from '@foundation/network/services';
import { firstValueFrom, Observable } from 'rxjs';
import { v4 as uuidv4 } from 'uuid';

const PROJECT_TRANSFER_SCHEMA = 'edf-project-rand/project-transfer';
const PROJECT_TRANSFER_VERSION = 1;

type ResourceKind =
	| 'project'
	| 'customer'
	| 'contributor'
	| 'facility'
	| 'batch'
	| 'activity'
	| 'deliverable'
	| 'activity_deliverable'
	| 'annual_contribution'
	| 'annual_facility_usage'
	| 'purchase';

interface ProjectTransferData {
	project: Project;
	customers: Customer[];
	contributors: Contributor[];
	facilities: Facility[];
	batches: Batch[];
	activities: Activity[];
	deliverables: Deliverable[];
	activityDeliverables: ActivityDeliverable[];
	annualContributions: AnnualContribution[];
	annualFacilityUsages: AnnualFacilityUsage[];
	purchases: Purchase[];
}

export interface ProjectTransferBundle {
	schema: string;
	version: number;
	exportedAt: string;
	sourceProjectId: string;
	data: ProjectTransferData;
}

export interface ProjectImportResult {
	projectId: string;
}

interface ProjectImportIdMaps {
	project: Map<string, string>;
	customer: Map<string, string>;
	contributor: Map<string, string>;
	facility: Map<string, string>;
	batch: Map<string, string>;
	activity: Map<string, string>;
	deliverable: Map<string, string>;
	activity_deliverable: Map<string, string>;
	annual_contribution: Map<string, string>;
	annual_facility_usage: Map<string, string>;
	purchase: Map<string, string>;
}

@Injectable({ providedIn: 'root' })
export class ProjectTransferService {
	private _requestService = inject(RequestService);

	private _projectsRepository = inject(ProjectsRepository);
	private _customersRepository = inject(CustomersRepository);
	private _contributorsRepository = inject(ContributorsRepository);
	private _facilitiesRepository = inject(FacilitiesRepository);
	private _batchesRepository = inject(BatchesRepository);
	private _activitiesRepository = inject(ActivitiesRepository);
	private _deliverablesRepository = inject(DeliverablesRepository);
	private _activityDeliverablesRepository = inject(ActivityDeliverablesRepository);
	private _annualContributionsRepository = inject(AnnualContributionsRepository);
	private _annualFacilityUsagesRepository = inject(AnnualFacilityUsagesRepository);
	private _purchasesRepository = inject(PurchasesRepository);

	private _entityEndpointByKind: Record<ResourceKind, string> = {
		project: '/api/edf/rand/projects',
		customer: '/api/edf/rand/customers',
		contributor: '/api/edf/rand/contributors',
		facility: '/api/edf/rand/facilities',
		batch: '/api/edf/rand/batches',
		activity: '/api/edf/rand/activities',
		deliverable: '/api/edf/rand/deliverables',
		activity_deliverable: '/api/edf/rand/activity-deliverables',
		annual_contribution: '/api/edf/rand/annual-contributions',
		annual_facility_usage: '/api/edf/rand/annual-facility-usages',
		purchase: '/api/edf/rand/purchases',
	};

	public async exportProjectBundle(projectId: string): Promise<ProjectTransferBundle> {
		const project = await this._fetchResourceById<Project>('project', projectId);
		if (!project) {
			throw new Error(`Project "${projectId}" not found or inaccessible.`);
		}

		const batches = await this._listResources<Batch>('batch', [`project_id:${project.id}:exact`]);
		const activities = (
			await Promise.all(
				batches.map((batch) =>
					this._listResources<Activity>('activity', [`batch_id:${batch.id}:exact`])
				)
			)
		).flat();

		const activityDeliverables = (
			await Promise.all(
				activities.map((activity) =>
					this._listResources<ActivityDeliverable>('activity_deliverable', [`activity_id:${activity.id}:exact`])
				)
			)
		).flat();

		const annualContributions = (
			await Promise.all(
				activities.map((activity) =>
					this._listResources<AnnualContribution>('annual_contribution', [`activity_id:${activity.id}:exact`])
				)
			)
		).flat();

		const annualFacilityUsages = (
			await Promise.all(
				activities.map((activity) =>
					this._listResources<AnnualFacilityUsage>('annual_facility_usage', [`activity_id:${activity.id}:exact`])
				)
			)
		).flat();

		const purchases = (
			await Promise.all(
				activities.map((activity) =>
					this._listResources<Purchase>('purchase', [`activity_id:${activity.id}:exact`])
				)
			)
		).flat();

		const deliverableIds = this._toUniqueIds(activityDeliverables.map((link) => link.deliverableId));
		const deliverables = await this._fetchResourcesByIds<Deliverable>('deliverable', deliverableIds);

		const customerIds = this._toUniqueIds([
			project.config.mainCustomerId,
			project.config.sponsorCustomerId,
			...deliverables.map((deliverable) => deliverable.customerId),
		]);
		const contributorIds = this._toUniqueIds([
			project.config.projectManagerContributorId,
			project.config.strategicLeadContributorId,
			...annualContributions.map((contribution) => contribution.contributorId),
		]);
		const facilityIds = this._toUniqueIds(annualFacilityUsages.map((usage) => usage.facilityId));

		const [customers, contributors, facilities] = await Promise.all([
			this._fetchResourcesByIds<Customer>('customer', customerIds),
			this._fetchResourcesByIds<Contributor>('contributor', contributorIds),
			this._fetchResourcesByIds<Facility>('facility', facilityIds),
		]);

		return {
			schema: PROJECT_TRANSFER_SCHEMA,
			version: PROJECT_TRANSFER_VERSION,
			exportedAt: new Date().toISOString(),
			sourceProjectId: project.id,
			data: {
				project,
				customers,
				contributors,
				facilities,
				batches,
				activities,
				deliverables,
				activityDeliverables,
				annualContributions,
				annualFacilityUsages,
				purchases,
			},
		};
	}

	public downloadProjectBundle(bundle: ProjectTransferBundle) {
		const json = JSON.stringify(bundle, null, 2);
		const blob = new Blob([json], { type: 'application/json' });
		const url = window.URL.createObjectURL(blob);
		const anchor = document.createElement('a');
		anchor.href = url;
		anchor.download = `project-export-${bundle.data.project.code || bundle.data.project.id}.json`;
		anchor.click();
		window.URL.revokeObjectURL(url);
	}

	public async importProjectBundle(rawBundle: unknown): Promise<ProjectImportResult> {
		const bundle = this._parseBundle(rawBundle);
		const idMaps = this._createEmptyIdMaps();

		await this._importCustomers(bundle.data.customers, idMaps);
		await this._importContributors(bundle.data.contributors, idMaps);
		await this._importFacilities(bundle.data.facilities, idMaps);
		const projectId = await this._importProject(bundle.data.project, idMaps);
		await this._importBatches(bundle.data.batches, projectId, idMaps);
		await this._importActivities(bundle.data.activities, idMaps);
		await this._importDeliverables(bundle.data.deliverables, idMaps);
		await this._importActivityDeliverables(bundle.data.activityDeliverables, idMaps);
		await this._importAnnualContributions(bundle.data.annualContributions, idMaps);
		await this._importAnnualFacilityUsages(bundle.data.annualFacilityUsages, idMaps);
		await this._importPurchases(bundle.data.purchases, idMaps);

		return {
			projectId,
		};
	}

	private async _importCustomers(customers: Customer[], idMaps: ProjectImportIdMaps) {
		for (const source of customers) {
			const newId = uuidv4();
			idMaps.customer.set(source.id, newId);
			const payload: Customer = {
				...this._stripResourceMeta(source),
				id: newId,
			};
			await this._createResource(payload, (data) => this._customersRepository.store.postObject$(data), `customer "${source.id}"`);
		}
	}

	private async _importContributors(contributors: Contributor[], idMaps: ProjectImportIdMaps) {
		for (const source of contributors) {
			const newId = uuidv4();
			idMaps.contributor.set(source.id, newId);
			const payload: Contributor = {
				...this._stripResourceMeta(source),
				id: newId,
			};
			await this._createResource(payload, (data) => this._contributorsRepository.store.postObject$(data), `contributor "${source.id}"`);
		}
	}

	private async _importFacilities(facilities: Facility[], idMaps: ProjectImportIdMaps) {
		for (const source of facilities) {
			const newId = uuidv4();
			idMaps.facility.set(source.id, newId);
			const payload: Facility = {
				...this._stripResourceMeta(source),
				id: newId,
			};
			await this._createResource(payload, (data) => this._facilitiesRepository.store.postObject$(data), `facility "${source.id}"`);
		}
	}

	private async _importProject(project: Project, idMaps: ProjectImportIdMaps) {
		const newProjectId = uuidv4();
		idMaps.project.set(project.id, newProjectId);

		const payload: Project = {
			...this._stripResourceMeta(project),
			id: newProjectId,
			config: this._mapProjectConfigIds(project.config, idMaps),
		};
		await this._createResource(payload, (data) => this._projectsRepository.store.postObject$(data), `project "${project.id}"`);
		return newProjectId;
	}

	private async _importBatches(batches: Batch[], projectId: string, idMaps: ProjectImportIdMaps) {
		for (const source of batches) {
			const newId = uuidv4();
			idMaps.batch.set(source.id, newId);
			const payload: Batch = {
				...this._stripResourceMeta(source),
				id: newId,
				projectId,
			};
			await this._createResource(payload, (data) => this._batchesRepository.store.postObject$(data), `batch "${source.id}"`);
		}
	}

	private async _importActivities(activities: Activity[], idMaps: ProjectImportIdMaps) {
		for (const source of activities) {
			const mappedBatchId = this._mapIdOrThrow(source.batchId, idMaps.batch, 'batch');
			const newId = uuidv4();
			idMaps.activity.set(source.id, newId);
			const payload: Activity = {
				...this._stripResourceMeta(source),
				id: newId,
				batchId: mappedBatchId,
			};
			await this._createResource(payload, (data) => this._activitiesRepository.store.postObject$(data), `activity "${source.id}"`);
		}
	}

	private async _importDeliverables(deliverables: Deliverable[], idMaps: ProjectImportIdMaps) {
		for (const source of deliverables) {
			const newId = uuidv4();
			idMaps.deliverable.set(source.id, newId);
			const payload: Deliverable = {
				...this._stripResourceMeta(source),
				id: newId,
				customerId: this._mapOptionalId(source.customerId, idMaps.customer),
			};
			await this._createResource(payload, (data) => this._deliverablesRepository.store.postObject$(data), `deliverable "${source.id}"`);
		}
	}

	private async _importActivityDeliverables(activityDeliverables: ActivityDeliverable[], idMaps: ProjectImportIdMaps) {
		for (const source of activityDeliverables) {
			const newId = uuidv4();
			idMaps.activity_deliverable.set(source.id, newId);
			const payload: ActivityDeliverable = {
				...this._stripResourceMeta(source),
				id: newId,
				activityId: this._mapIdOrThrow(source.activityId, idMaps.activity, 'activity'),
				deliverableId: this._mapIdOrThrow(source.deliverableId, idMaps.deliverable, 'deliverable'),
			};
			await this._createResource(
				payload,
				(data) => this._activityDeliverablesRepository.store.postObject$(data),
				`activity_deliverable "${source.id}"`
			);
		}
	}

	private async _importAnnualContributions(contributions: AnnualContribution[], idMaps: ProjectImportIdMaps) {
		for (const source of contributions) {
			const newId = uuidv4();
			idMaps.annual_contribution.set(source.id, newId);
			const payload: AnnualContribution = {
				...this._stripResourceMeta(source),
				id: newId,
				activityId: this._mapIdOrThrow(source.activityId, idMaps.activity, 'activity'),
				contributorId: this._mapIdOrThrow(source.contributorId, idMaps.contributor, 'contributor'),
			};
			await this._createResource(
				payload,
				(data) => this._annualContributionsRepository.store.postObject$(data),
				`annual_contribution "${source.id}"`
			);
		}
	}

	private async _importAnnualFacilityUsages(usages: AnnualFacilityUsage[], idMaps: ProjectImportIdMaps) {
		for (const source of usages) {
			const newId = uuidv4();
			idMaps.annual_facility_usage.set(source.id, newId);
			const payload: AnnualFacilityUsage = {
				...this._stripResourceMeta(source),
				id: newId,
				activityId: this._mapIdOrThrow(source.activityId, idMaps.activity, 'activity'),
				facilityId: this._mapIdOrThrow(source.facilityId, idMaps.facility, 'facility'),
			};
			await this._createResource(
				payload,
				(data) => this._annualFacilityUsagesRepository.store.postObject$(data),
				`annual_facility_usage "${source.id}"`
			);
		}
	}

	private async _importPurchases(purchases: Purchase[], idMaps: ProjectImportIdMaps) {
		for (const source of purchases) {
			const newId = uuidv4();
			idMaps.purchase.set(source.id, newId);
			const payload: Purchase = {
				...this._stripResourceMeta(source),
				id: newId,
				activityId: this._mapIdOrThrow(source.activityId, idMaps.activity, 'activity'),
			};
			await this._createResource(payload, (data) => this._purchasesRepository.store.postObject$(data), `purchase "${source.id}"`);
		}
	}

	private _stripResourceMeta<T extends { timeCreated?: string; timeUpdated?: string }>(resource: T) {
		const { timeCreated: _timeCreated, timeUpdated: _timeUpdated, ...rest } = resource;
		return rest;
	}

	private _mapProjectConfigIds(config: Project['config'], idMaps: ProjectImportIdMaps): Project['config'] {
		const sourceConfig = config ?? {};
		return {
			...sourceConfig,
			mainCustomerId: this._mapOptionalId(sourceConfig.mainCustomerId, idMaps.customer),
			sponsorCustomerId: this._mapOptionalId(sourceConfig.sponsorCustomerId, idMaps.customer),
			projectManagerContributorId: this._mapOptionalId(sourceConfig.projectManagerContributorId, idMaps.contributor),
			strategicLeadContributorId: this._mapOptionalId(sourceConfig.strategicLeadContributorId, idMaps.contributor),
		};
	}

	private _mapOptionalId(sourceId: string | undefined | null, mapping: Map<string, string>) {
		if (!sourceId) return undefined;
		return mapping.get(sourceId);
	}

	private _mapIdOrThrow(sourceId: string, mapping: Map<string, string>, label: string) {
		const mapped = mapping.get(sourceId);
		if (!mapped) {
			throw new Error(`Missing ${label} mapping for "${sourceId}".`);
		}
		return mapped;
	}

	private _createEmptyIdMaps(): ProjectImportIdMaps {
		return {
			project: new Map<string, string>(),
			customer: new Map<string, string>(),
			contributor: new Map<string, string>(),
			facility: new Map<string, string>(),
			batch: new Map<string, string>(),
			activity: new Map<string, string>(),
			deliverable: new Map<string, string>(),
			activity_deliverable: new Map<string, string>(),
			annual_contribution: new Map<string, string>(),
			annual_facility_usage: new Map<string, string>(),
			purchase: new Map<string, string>(),
		};
	}

	private async _listResources<T>(kind: ResourceKind, filters: string[] = []) {
		const endpoint = this._entityEndpointByKind[kind];
		const items: T[] = [];
		let page = 1;
		const pageSize = 1000;

		for (;;) {
			const response = await firstValueFrom(
				this._requestService.getBasic$<PaginatedResponse<T>>(endpoint, {
					page,
					page_size: pageSize,
					...(filters.length > 0 ? { filters } : {}),
				})
			);
			const result = this._requireResult(response, `Unable to list ${kind}`);
			items.push(...(result.data ?? []));
			if (!result.hasNext) break;
			page += 1;
		}
		return items;
	}

	private async _fetchResourcesByIds<T>(kind: ResourceKind, ids: (string | undefined | null)[]) {
		const uniqueIds = this._toUniqueIds(ids);
		if (uniqueIds.length === 0) return [];

		const results = await Promise.all(uniqueIds.map((id) => this._fetchResourceById<T>(kind, id)));
		const resources: T[] = [];
		for (const resource of results) {
			if (resource !== null) resources.push(resource);
		}
		return resources;
	}

	private async _fetchResourceById<T>(kind: ResourceKind, resourceId: string): Promise<T | null> {
		const endpoint = this._entityEndpointByKind[kind];
		const response = await firstValueFrom(this._requestService.getObject$<T>(`${endpoint}/${resourceId}`));
		if (response.error) return null;
		return response.result?.data ?? null;
	}

	private _toUniqueIds(ids: (string | undefined | null)[]) {
		return Array.from(
			new Set(
				ids
					.filter((id): id is string => typeof id === 'string' && id.length > 0)
					.map((id) => id.trim())
			)
		);
	}

	private async _createResource<T extends { id: string }>(
		payload: T,
		createFn: (payload: T) => Observable<RequestResponse<SimpleResponse<T>>>,
		context: string
	) {
		const response = await firstValueFrom(createFn(payload));
		this._requireSimpleData(response, `Unable to create ${context}`);
	}

	private _requireResult<T>(response: { result?: T; error?: { title?: string; description?: string } }, context: string): T {
		if (response.error || !response.result) {
			const message = response.error?.description || response.error?.title || context;
			throw new Error(message);
		}
		return response.result;
	}

	private _requireSimpleData<T>(response: RequestResponse<SimpleResponse<T>>, context: string): T {
		if (response.error || !response.result?.data) {
			const message = response.error?.description || response.error?.title || context;
			throw new Error(message);
		}
		return response.result.data;
	}

	private _parseBundle(rawBundle: unknown): ProjectTransferBundle {
		if (!rawBundle || typeof rawBundle !== 'object') {
			throw new Error('Invalid project import payload: expected a JSON object.');
		}

		const bundle = rawBundle as Partial<ProjectTransferBundle>;
		if (bundle.schema !== PROJECT_TRANSFER_SCHEMA) {
			throw new Error(`Unsupported project import schema "${bundle.schema ?? 'unknown'}".`);
		}
		if (bundle.version !== PROJECT_TRANSFER_VERSION) {
			throw new Error(`Unsupported project import version "${bundle.version ?? 'unknown'}".`);
		}
		if (!bundle.data?.project) {
			throw new Error('Invalid project import payload: missing project data.');
		}

		return {
			schema: bundle.schema,
			version: bundle.version,
			exportedAt: bundle.exportedAt ?? new Date().toISOString(),
			sourceProjectId: bundle.sourceProjectId ?? bundle.data.project.id,
			data: {
				project: bundle.data.project,
				customers: bundle.data.customers ?? [],
				contributors: bundle.data.contributors ?? [],
				facilities: bundle.data.facilities ?? [],
				batches: bundle.data.batches ?? [],
				activities: bundle.data.activities ?? [],
				deliverables: bundle.data.deliverables ?? [],
				activityDeliverables: bundle.data.activityDeliverables ?? [],
				annualContributions: bundle.data.annualContributions ?? [],
				annualFacilityUsages: bundle.data.annualFacilityUsages ?? [],
				purchases: bundle.data.purchases ?? [],
			},
		};
	}
}
