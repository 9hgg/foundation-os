import { OverlayContainer, FullscreenOverlayContainer } from '@angular/cdk/overlay';
import { CdkMenuModule } from '@angular/cdk/menu';
import { PortalModule } from '@angular/cdk/portal';
import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, ElementRef, computed, effect, inject, model, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { ActivitiesModals, BatchesModals, DeliverablesModals } from '@edf/edf-project-rands/modals';
import { Activity, ActivityDeliverable, AnnualContribution, AnnualFacilityUsage, Batch, CategoryEnum, Deliverable, Project, Purchase } from '@edf/edf-project-rands/models';
import { ActivitiesRepository, ActivityDeliverablesRepository, BatchesRepository, ContributorsRepository, CustomersRepository, DeliverablesRepository, ProjectsRepository } from '@edf/edf-project-rands/state';
import { DetailedActivity, DetailedProjectTableComponent, ExtraPropertiesEditorComponent, ReportEditorComponent } from '@edf/edf-project-rands/ui';
import { NotificationService } from '@foundation/notification';
import { TranslateDirective } from '@foundation/translations/services';
import { BehaviorSubjectReplayedFromObs, MetaDataService, PatchableItem } from '@foundation/utils';
import { combineLatest, debounceTime, map, of, Subject, switchMap, tap, throttleTime } from 'rxjs';
import { v4 as uuidv4 } from 'uuid';
import { ProjectBuilderMenuComponent } from './project-builder-menu/project-builder-menu.component';
import { ProjectBatchSelectorComponent } from './project-batch-selector/project-batch-selector.component';
import { ProjectContributorsTabComponent } from './project-contributors-tab/project-contributors-tab.component';
import { ProjectCostService } from './project-cost.service';
import { ProjectPresentationsTabComponent } from './project-presentations-tab/project-presentations-tab.component';
import { PresentationTocItem, ProjectPresentationTabComponent } from './project-presentation-tab/project-presentation-tab.component';
import { ProjectCostFollowupTabComponent } from './project-cost-followup-tab/project-cost-followup-tab.component';
import { ProjectPurchasesTabComponent } from './project-purchases-tab/project-purchases-tab.component';
import { ProjectSlidesTabComponent } from './project-slides-tab/project-slides-tab.component';

@Component({
	selector: 'lib-edf-project-rand-builder-page',
	standalone: true,
	imports: [CommonModule, FormsModule, TranslateDirective, RouterModule, CdkMenuModule, PortalModule, DetailedProjectTableComponent, ExtraPropertiesEditorComponent, ReportEditorComponent, ProjectBuilderMenuComponent, ProjectBatchSelectorComponent, ProjectPurchasesTabComponent, ProjectContributorsTabComponent, ProjectPresentationTabComponent, ProjectPresentationsTabComponent, ProjectSlidesTabComponent, ProjectCostFollowupTabComponent],
	providers: [{ provide: OverlayContainer, useClass: FullscreenOverlayContainer }],
	templateUrl: './project-builder-page.component.html',
	styleUrls: ['./project-builder-page.component.css'],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProjectsBuilderPageComponent {
	public notificationService = inject(NotificationService);
	private _router = inject(Router);
	private _route = inject(ActivatedRoute);
	private _projectsRepository = inject(ProjectsRepository);
	private _metaDataService = inject(MetaDataService);
	private _customersRepository = inject(CustomersRepository);
	private _projectCostService = inject(ProjectCostService);
	private _batchesRepository = inject(BatchesRepository);
	private _batchesModals = inject(BatchesModals);
	private _contributorsRepository = inject(ContributorsRepository);
	private _activitiesRepository = inject(ActivitiesRepository);
	private _activitiesModals = inject(ActivitiesModals);
	private _deliverablesModals = inject(DeliverablesModals);
	private _activityDeliverablesRepository = inject(ActivityDeliverablesRepository);
	private _deliverablesRepository = inject(DeliverablesRepository);

	private _pageShell = viewChild<ElementRef<HTMLDivElement>>('pageShell');
	private _mainContent = viewChild<ElementRef<HTMLElement>>('mainContent');
	private _detailedProjectTable = viewChild(DetailedProjectTableComponent);
	private _projectPresentationTab = viewChild(ProjectPresentationTabComponent);
	private _projectPresentationsTab = viewChild(ProjectPresentationsTabComponent);
	private _refreshDetailedActivities$ = new Subject<void>();
	targetPresentationActivityId = signal<string | null>(null);
	targetPresentationUpdateId = signal<string | null>(null);

	activeTab = model<string | null>(null);

	public projectId = model<string | null>(null);
	patchableProject = new PatchableItem<Project>(
		this.projectId,
		(id) => (id ? this._projectsRepository.store.getObjectByIdPullOnce$$$(id).$ : of(null)),
		(projectId, patch) => this._projectsRepository.store.applyPatch(projectId, patch)
	);
	project$$$ = this.patchableProject.item$$$;

	batches$$$ = BehaviorSubjectReplayedFromObs<Batch[]>(
		[],
		this.project$$$.pipe(
			switchMap((project) => {
				if (!project) return of([]);
				const projectId = project.id;
				return this._batchesRepository.store.getObjects$(1, 100, [{ fieldName: 'project_id', matchType: 'exact', value: projectId }], 'prefix:asc', true).pipe(
					map((r) => {
						const holedBatches = r.data || [];
						const batches = holedBatches.filter((a): a is Batch => a !== null);
						return batches;
					})
				);
			}),
			tap((batches) => {
				console.log('[ProjectsBuilderPageComponent] batches loaded', batches);
			})
		)
	);

	activitiesByBatch$$$ = BehaviorSubjectReplayedFromObs<{ batch: Batch; activities: Activity[] }[]>(
		[],
		this.batches$$$.pipe(
			switchMap((batches) => {
				if (batches.length === 0) {
					return of([]);
				}
				return combineLatest(
					batches.map((batch) =>
						this._activitiesRepository.store.getObjects$(1, 100, [{ fieldName: 'batch_id', matchType: 'exact', value: batch.id }], 'id:asc', true).pipe(
							map((r) => {
								const holedActivities = r.data || [];
								const activities = holedActivities.filter((a): a is Activity => a !== null);
								return { batch, activities };
							})
						)
					)
				);
			}),
			tap((activitiesByBatch) => {
				console.log('[ProjectsBuilderPageComponent] activitiesByBatch loaded', activitiesByBatch);
			})
		)
	);

	activitiesByBatchWithDeliverables$$$ = BehaviorSubjectReplayedFromObs<{ batch: Batch; activities: { activity: Activity; deliverables: Deliverable[] }[] }[]>(
		[],
		this.activitiesByBatch$$$.pipe(
			switchMap((activitiesByBatch) => {
				if (activitiesByBatch.length === 0) return of([]);
				return combineLatest(
					activitiesByBatch.map(({ batch, activities }) => {
						if (activities.length === 0) {
							return of({ batch, activities: [] });
						}
						return combineLatest(
							activities.map((activity) =>
								this._activityDeliverablesRepository.store.getObjects$(1, 100, [{ fieldName: 'activity_id', matchType: 'exact', value: activity.id }], 'id:asc', true).pipe(
									switchMap((responseActivityDeliverables) => {
										const holedActivityDeliverables = responseActivityDeliverables.data || [];
										const activityDeliverables = holedActivityDeliverables.filter((ad): ad is ActivityDeliverable => ad !== null);
										if (activityDeliverables.length === 0) {
											return of({ activity, deliverables: [] });
										}
										return combineLatest(activityDeliverables.map((ad) => this._deliverablesRepository.store.getObjectByIdPullOnce$$$(ad.deliverableId).$)).pipe(
											map((uncertainDeliverables) => ({
												activity,
												deliverables: uncertainDeliverables.filter((d): d is Deliverable => d !== null),
											}))
										);
									})
								)
							)
						).pipe(
							map((activitiesWithDeliverables) => ({
								batch,
								activities: activitiesWithDeliverables,
							}))
						);
					})
				);
			}),
			debounceTime(300),
			tap((activitiesByBatchWithDeliverables) => {
				console.log('[ProjectsBuilderPageComponent] activitiesByBatchWithDeliverables loaded', activitiesByBatchWithDeliverables);
			})
		)
	);

	financialDataByActivities$$$ = BehaviorSubjectReplayedFromObs<{
		contributions: AnnualContribution[];
		facilityUsages: AnnualFacilityUsage[];
		purchases: Purchase[];
		contributorCategories: Record<string, CategoryEnum | null>;
	}>(
		{
			contributions: [],
			facilityUsages: [],
			purchases: [],
			contributorCategories: {},
		},
		this.activitiesByBatch$$$.pipe(
			map((activitiesByBatch) => activitiesByBatch.flatMap((entry) => entry.activities).map((activity) => activity.id)),
			switchMap((activityIds) => this._projectCostService.loadFinancialDataForActivities$(activityIds)),
			throttleTime(100, undefined, { leading: true, trailing: true }),
			tap((financialDataByActivities) => {
				console.log('[ProjectsBuilderPageComponent] financialDataByActivities loaded', financialDataByActivities);
			})
		)
	);

	customers$$$ = BehaviorSubjectReplayedFromObs<Record<string, { unit: string }>>(
		{},
		this.activitiesByBatchWithDeliverables$$$.pipe(
			map((activitiesByBatchWithDeliverables) => {
				const customerIds = activitiesByBatchWithDeliverables
					.flatMap((entry) => entry.activities)
					.flatMap((entry) => entry.deliverables)
					.map((deliverable) => deliverable.customerId)
					.filter((customerId): customerId is string => !!customerId);
				return [...new Set(customerIds)];
			}),
			switchMap((customerIds) => {
				if (customerIds.length === 0) return of({} as Record<string, { unit: string }>);
				return combineLatest(
					customerIds.map((customerId) =>
						this._customersRepository.store.getObjectByIdPullOnce$$$(customerId).$.pipe(
							map((customer) => ({
								customerId,
								customer,
							}))
						)
					)
				).pipe(
					map((items) =>
						items.reduce(
							(acc, { customerId, customer }) => {
								acc[customerId] = { unit: customer?.unit ?? '' };
								return acc;
							},
							{} as Record<string, { unit: string }>
						)
					)
				);
			}),
			throttleTime(100, undefined, { leading: true, trailing: true }),
			tap((customers) => {
				console.log('[ProjectsBuilderPageComponent] customers loaded', customers);
			})
		)
	);

	mainCustomerDisplayName = signal<string>('');
	sponsorCustomerDisplayName = signal<string>('');
	projectManagerDisplayName = signal<string>('');
	strategicLeadDisplayName = signal<string>('');

	batches = signal<Batch[]>([]);
	purchases = signal<Purchase[]>([]);
	contributions = signal<AnnualContribution[]>([]);
	facilityUsages = signal<AnnualFacilityUsage[]>([]);
	contributorCategories = signal<Record<string, CategoryEnum | null>>({});
	selectedPurchasesYear = signal<number | null>(null);
	selectedContributorsYear = signal<number | null>(null);
	selectedPresentationYear = signal<number | null>(null);
	selectedPresentationCatalogId = signal<string | null>(null);
	presentationFocusMode = signal(false);
	selectedBatchId = signal<string | null>('no-zero');
	selectedBatch = computed(() => {
		const batchId = this.selectedBatchId();
		const batches = this.batches();
		return batches.find((b) => b.id === batchId) || null;
	});

	private _unfilteredDetailedActivities = signal<DetailedActivity[]>([]);
	allDetailedActivities = computed(() => this._unfilteredDetailedActivities());
	displayedDetailedActivities = computed(() => {
		const _detailedActivities = this._unfilteredDetailedActivities();
		const selectedBatchId = this.selectedBatchId();
		let displayedDetailedActivities = _detailedActivities;
		if (selectedBatchId == 'no-zero') {
			// remove the lot with prefix "0" or "L0" if it exists, to avoid confusion with "no batch"
			displayedDetailedActivities = _detailedActivities.filter((b) => !(b.batch.prefix === '0' || b.batch.prefix === 'L0'));
		} else if (selectedBatchId) {
			displayedDetailedActivities = _detailedActivities.filter((b) => b.batch.id === selectedBatchId);
		}
		return displayedDetailedActivities;
	});
	displayedActivityIds = computed(() => this.displayedDetailedActivities().map((item) => item.activity.id));
	presentationTocItems = signal<PresentationTocItem[]>([]);
	projectPresentationYears = computed(() => {
		const project = this.patchableProject.patchedItem();
		if (!project?.startDate || !project?.endDate) return [];
		const startYear = new Date(project.startDate).getFullYear();
		const endYear = new Date(project.endDate).getFullYear();
		if (!Number.isFinite(startYear) || !Number.isFinite(endYear) || endYear < startYear) return [];
		const years: number[] = [];
		for (let year = startYear; year <= endYear; year++) years.push(year);
		return years;
	});

	constructor() {
		const initialParams = this._route.snapshot.queryParamMap;
		this.activeTab.set(this._isValidTab(initialParams.get('activeTab')) ? initialParams.get('activeTab') : 'details');
		this.activeReportId.set(initialParams.get('activeReportId'));
		this.selectedBatchId.set(this._parseSelectedBatchId(initialParams.get('selectedBatchId')));
		this.selectedPurchasesYear.set(this._parseSelectedYear(initialParams.get('achatsYear')));
		this.selectedContributorsYear.set(this._parseSelectedYear(initialParams.get('contributeursYear')));
		this.selectedPresentationYear.set(this._parseSelectedYear(initialParams.get('presentationYear')));
		this.selectedPresentationCatalogId.set(initialParams.get('presentationCatalogId'));
		this.targetPresentationActivityId.set(initialParams.get('presentationActivityId'));
		this.targetPresentationUpdateId.set(initialParams.get('presentationUpdateId'));

		this._route.queryParamMap
			.pipe(
				takeUntilDestroyed(),
				tap((queryParams) => {
					const activeTabFromQuery = queryParams.get('activeTab');
					this.activeTab.set(this._isValidTab(activeTabFromQuery) ? activeTabFromQuery : 'details');
					this.activeReportId.set(queryParams.get('activeReportId'));
					this.selectedBatchId.set(this._parseSelectedBatchId(queryParams.get('selectedBatchId')));
					this.selectedPurchasesYear.set(this._parseSelectedYear(queryParams.get('achatsYear')));
					this.selectedContributorsYear.set(this._parseSelectedYear(queryParams.get('contributeursYear')));
					this.selectedPresentationYear.set(this._parseSelectedYear(queryParams.get('presentationYear')));
					this.selectedPresentationCatalogId.set(queryParams.get('presentationCatalogId'));
					this.targetPresentationActivityId.set(queryParams.get('presentationActivityId'));
					this.targetPresentationUpdateId.set(queryParams.get('presentationUpdateId'));
				})
			)
			.subscribe();

		effect(() => {
			const batches = this.batches();
			const selectedBatchId = this.selectedBatchId();
			if (selectedBatchId === null || selectedBatchId === 'no-zero') return;
			if (batches.length === 0) return;
			if (batches.some((batch) => batch.id === selectedBatchId)) return;
			this.selectedBatchId.set(null);
		});

		effect(() => {
			if (this.activeTab() !== 'presentation') return;
			const container = this._mainContent();
			if (!container) return;
			setTimeout(() => {
				container.nativeElement.scrollTop = 0;
				setTimeout(() => {
					container.nativeElement.scrollTop = 0;
				}, 100);
			}, 0);
		});

		effect(() => {
			if (!this._isPresentationTab(this.activeTab())) return;
			const presentationTab = this._getActivePresentationTab();
			if (!presentationTab) return;
			const targetUpdateId = this.targetPresentationUpdateId();
			const targetActivityId = this.targetPresentationActivityId();

			if (targetUpdateId) {
				queueMicrotask(() => presentationTab.scrollToUpdate(targetUpdateId, targetActivityId));
				return;
			}
			if (targetActivityId) {
				queueMicrotask(() => presentationTab.scrollToSlide(targetActivityId));
			}
		});

		effect((onCleanup) => {
			if (!this._isPresentationTab(this.activeTab()) || !this.presentationFocusMode()) return;

			const handleEscape = (event: KeyboardEvent) => {
				if (event.key !== 'Escape') return;
				this.presentationFocusMode.set(false);
			};

			window.addEventListener('keydown', handleEscape);
			onCleanup(() => window.removeEventListener('keydown', handleEscape));
		});

		effect((onCleanup) => {
			const handleFullscreenChange = () => {
				if (document.fullscreenElement) return;
				if (!this.presentationFocusMode()) return;
				this.presentationFocusMode.set(false);
			};

			document.addEventListener('fullscreenchange', handleFullscreenChange);
			onCleanup(() => document.removeEventListener('fullscreenchange', handleFullscreenChange));
		});

		// effect(() => {
		// 	const pageShell = this._pageShell()?.nativeElement;
		// 	if (!pageShell) return;

		// 	if (this.presentationFocusMode()) {
		// 		if (document.fullscreenElement === pageShell) return;
		// 		void pageShell.requestFullscreen().catch((error) => {
		// 			console.warn('Failed to enter presentation focus mode', error);
		// 		});
		// 		return;
		// 	}

		// 	if (document.fullscreenElement !== pageShell) return;
		// 	void document.exitFullscreen().catch((error) => {
		// 		console.warn('Failed to exit presentation focus mode', error);
		// 	});
		// });

		effect(() => {
			if (this._isPresentationTab(this.activeTab())) return;
			if (!this.presentationFocusMode()) return;
			this.presentationFocusMode.set(false);
		});

		// reacts to builder state changes to update the url
		effect(() => {
			const activeTab = this.activeTab() ?? 'details';
			const activeReportId = this.activeReportId();
			const selectedBatchId = this._serializeSelectedBatchId(this.selectedBatchId());
			const achatsYear = this._serializeSelectedYear(this.selectedPurchasesYear());
			const contributeursYear = this._serializeSelectedYear(this.selectedContributorsYear());
			const presentationYear = this._serializeSelectedYear(this.selectedPresentationYear());
			const presentationCatalogId = this.selectedPresentationCatalogId();

			this._router.navigate([], {
				relativeTo: this._route,
				queryParams: { activeTab, activeReportId, selectedBatchId, achatsYear, contributeursYear, presentationYear, presentationCatalogId },
				replaceUrl: true,
				queryParamsHandling: 'merge',
				preserveFragment: true,
			});
		});

		// project$$$ -> mainCustomer, sponsorCustomer, pmContributor, strategicContributor
		this.project$$$
			.pipe(
				takeUntilDestroyed(),
				switchMap((project) => {
					console.log('[ProjectsBuilderPageComponent](customers) project changed', project);
					const mainCustomer$ = project?.config.mainCustomerId ? this._customersRepository.store.getObjectByIdPullOnce$$$(project.config.mainCustomerId).$ : of(null);
					const sponsorCustomer$ = project?.config.sponsorCustomerId ? this._customersRepository.store.getObjectByIdPullOnce$$$(project.config.sponsorCustomerId).$ : of(null);
					const pmContributor$ = project?.config.projectManagerContributorId ? this._contributorsRepository.store.getObjectByIdPullOnce$$$(project.config.projectManagerContributorId).$ : of(null);
					const strategicContributor$ = project?.config.strategicLeadContributorId ? this._contributorsRepository.store.getObjectByIdPullOnce$$$(project.config.strategicLeadContributorId).$ : of(null);
					return combineLatest([mainCustomer$, sponsorCustomer$, pmContributor$, strategicContributor$]);
				}),
				tap(([mainCustomer, sponsorCustomer, pmContributor, strategicContributor]) => {
					this.mainCustomerDisplayName.set(mainCustomer ? `${mainCustomer.firstName ?? ''} ${mainCustomer.lastName ?? ''}`.trim() + (mainCustomer.unit ? ` (${mainCustomer.unit})` : '') : '');
					this.sponsorCustomerDisplayName.set(sponsorCustomer ? `${sponsorCustomer.firstName ?? ''} ${sponsorCustomer.lastName ?? ''}`.trim() : '');
					this.projectManagerDisplayName.set(pmContributor ? `${pmContributor.firstName ?? ''} ${pmContributor.lastName ?? ''}`.trim() : '');
					this.strategicLeadDisplayName.set(strategicContributor ? `${strategicContributor.firstName ?? ''} ${strategicContributor.lastName ?? ''}`.trim() : '');
				})
			)
			.subscribe();

		const availableData$ = combineLatest([this.project$$$.$, this.batches$$$.$, this.activitiesByBatchWithDeliverables$$$.$, this.financialDataByActivities$$$.$, this.customers$$$.$]).pipe(
			throttleTime(100, undefined, { leading: true, trailing: true }),
			switchMap(([project, batches, activitiesByBatchWithDeliverables, financialData, customers]) => {
				if (!project) return of(null);

				const detailedActivities = activitiesByBatchWithDeliverables.flatMap(({ batch, activities }) =>
					activities.map(({ activity, deliverables }) => {
						const batchPrefix = batch.prefix ?? '';
						const activityPrefix = activity.prefix ?? '';
						const mergedPrefix = batchPrefix && activityPrefix ? `${batchPrefix}.${activityPrefix}` : batchPrefix || activityPrefix || '';
						const detailedActivity: DetailedActivity = {
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
						};
						return detailedActivity;
					})
				);

				const deliverableCustomerUnitById = activitiesByBatchWithDeliverables
					.flatMap((entry) => entry.activities)
					.flatMap((entry) => entry.deliverables)
					.reduce(
						(acc, deliverable) => {
							if (!deliverable.id) return acc;
							const customerId = deliverable.customerId;
							acc[deliverable.id] = customerId ? (customers[customerId]?.unit ?? '') : '';
							return acc;
						},
						{} as Record<string, string>
					);

				return of({
					project,
					batches,
					detailedActivities,
					financialData,
					deliverableCustomerUnitById,
				});
			}),
			throttleTime(300, undefined, { leading: false, trailing: true }),
			map((payload) => {
				if (!payload) return null;
				const { project, batches, detailedActivities, financialData, deliverableCustomerUnitById } = payload;
				const sortedDetailedActivities = [...detailedActivities].sort((a, b) => this._compareDetailedActivitiesByPrefix(a, b));
				const activitiesWithDeliverableUnits = sortedDetailedActivities.map((item) => ({
					...item,
					deliverables: item.deliverables.map((deliverable) => ({
						...deliverable,
						customerUnit: deliverableCustomerUnitById[deliverable.id] || '',
					})),
				}));

				const costData = this._projectCostService.buildCostReportData({
					project,
					activities: sortedDetailedActivities,
					batches,
					financialData,
				});

				return {
					project,
					mainCustomer: this.mainCustomerDisplayName(),
					sponsorCustomer: this.sponsorCustomerDisplayName(),
					projectManager: this.projectManagerDisplayName(),
					strategicLead: this.strategicLeadDisplayName(),
					activities: activitiesWithDeliverableUnits,
					batches,
					deliverableCustomerUnitById,
					...costData,
					...Object.entries(project.config.extraProperties ?? {}).reduce(
						(acc, [key, prop]) => {
							acc[prop.key] = prop.content;
							return acc;
						},
						{} as Record<string, unknown>
					),
				};
			}),
			tap((availableData) => {
				console.log('[ProjectsBuilderPageComponent] availableData loaded', availableData);
			})
		);

		this.financialDataByActivities$$$.$.pipe(takeUntilDestroyed()).subscribe((financialData) => {
			this.purchases.set(financialData.purchases);
			this.contributions.set(financialData.contributions);
			this.facilityUsages.set(financialData.facilityUsages);
			this.contributorCategories.set(financialData.contributorCategories);
		});

		availableData$.pipe(takeUntilDestroyed()).subscribe((availableData) => {
			this.availableData.set(availableData);
			this.batches.set((availableData?.['batches'] as Batch[]) ?? []);
			this._unfilteredDetailedActivities.set((availableData?.['activities'] as DetailedActivity[]) ?? []);
		});

		// selected batch activities -> table
		effect(() => {
			const selectedBatchActivities = this.displayedDetailedActivities();
			const table = this._detailedProjectTable();
			if (table) {
				table.explicitItems.set(selectedBatchActivities);
			}
		});

		effect((onCleanup) => {
			const project = this.patchableProject.patchedItem();
			if (project) {
				const projectLabel = project.name || project.code || project.id;
				this._metaDataService.setTitle(`Projet · ${projectLabel}`);
			}

			onCleanup(() => {
				this._metaDataService.resetTitle();
			});
		});
	}

	// for reports
	availableData = signal<Record<string, unknown> | null>(null);

	activeReportId = model<string | null>(null);

	public addDeliverableToActivity(activity: Activity) {
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
				}),
				tap((result) => {
					if (!result) return;
					this.notificationService.snackSuccess('Deliverable created and linked to activity successfully.');
					this._refreshDetailedActivities$.next();
				})
			)
			.subscribe();
	}

	public addBatch() {
		const project = this.project$$$.value;
		if (!project) return;

		const dialogRef = this._batchesModals.openBatchCreateDialog({ projectId: project.id });
		dialogRef.closed.subscribe((result) => {
			if (!result) return;
			const payload: Batch = {
				id: uuidv4(),
				title: result.title,
				prefix: result.prefix,
				description: result.description,
				projectId: result.projectId,
			};
			this._batchesRepository.store.postObject$(payload).subscribe((r) => {
				const newId = r?.result?.data?.id;
				if (newId) {
					this.notificationService.snackSuccess('Batch created successfully.');
					this._refreshDetailedActivities$.next();
				}
			});
		});
	}

	public addActivity() {
		let batchId = this.selectedBatchId();
		if (batchId == 'no-zero') batchId = null;

		const dialogRef = this._activitiesModals.openActivityCreateDialog({
			projectId: this.projectId(),
			batchId,
		});
		dialogRef.closed.subscribe((result) => {
			if (!result) return;
			const activity: Activity = {
				id: uuidv4(),
				title: result.title,
				prefix: result.prefix,
				batchId: result.batchId,
				description: result.description,
				finality: result.finality,
				strategicInterests: result.strategicInterests,
				synergies: result.synergies,
				risks: result.risks,
				parades: result.parades,
				priority: result.priority,
				isCorporate: result.isCorporate,
				isConfirmed: result.isConfirmed,
				hidden: false,
				tags: result.tags,
			};

			this._activitiesRepository.store.postObject$(activity).subscribe((response) => {
				const newId = response?.result?.data?.id;
				if (newId) {
					this.notificationService.success('Activity created successfully.', undefined, { hasBackdrop: false });
					this._refreshDetailedActivities$.next();
				}
			});
		});
	}

	public addActivityForBatch(batch: Batch) {
		const dialogRef = this._activitiesModals.openActivityCreateDialog({ batchId: batch.id });
		dialogRef.closed.subscribe((result) => {
			if (!result) return;
			const activity: Activity = {
				id: uuidv4(),
				title: result.title,
				prefix: result.prefix,
				batchId: result.batchId,
				description: result.description,
				finality: result.finality,
				strategicInterests: result.strategicInterests,
				synergies: result.synergies,
				risks: result.risks,
				parades: result.parades,
				priority: result.priority,
				isCorporate: result.isCorporate,
				isConfirmed: result.isConfirmed,
				hidden: false,
				tags: result.tags,
			};

			this._activitiesRepository.store.save(activity).subscribe((response) => {
				const newId = response?.result?.data?.id;
				if (newId) {
					this.notificationService.snackSuccess('Activity created successfully.');
					this._refreshDetailedActivities$.next();
				}
			});
		});
	}

	public goToBuilder(event: { column: string; item: DetailedActivity; message?: unknown }) {
		const { column, item, message } = event;
		console.log('ProjectsBuilderPageComponent: goToBuilder', { column, item, message });
		// go to activity builder page or batch builder page
		if (column === 'activity') {
			this._activitiesRepository.goToActivity(item.activity.id);
		} else if (column === 'batch') {
			this._batchesRepository.goToBatch(item.batch.id);
		}
	}

	public scrollToPresentationActivity(activityId: string) {
		this._getActivePresentationTab()?.scrollToSlide(activityId);
	}

	private _getActivePresentationTab() {
		if (this.activeTab() === 'presentation') return this._projectPresentationTab();
		if (this.activeTab() === 'presentations') return this._projectPresentationsTab();
		return undefined;
	}

	private _compareDetailedActivitiesByPrefix(a: DetailedActivity, b: DetailedActivity): number {
		const batchOrder = this._comparePrefixValues(a.batch.prefix, b.batch.prefix);
		if (batchOrder !== 0) return batchOrder;
		return this._comparePrefixValues(a.activity.prefix, b.activity.prefix);
	}

	private _isPresentationTab(tab: string | null): tab is 'presentation' | 'presentations' {
		return tab === 'presentation' || tab === 'presentations';
	}

	private _isValidTab(tab: string | null): tab is 'extra-properties' | 'details' | 'reports' | 'achats' | 'contributeurs' | 'presentation' | 'presentations' | 'slides' | 'cost-followup' {
		return tab === 'extra-properties' || tab === 'details' || tab === 'reports' || tab === 'achats' || tab === 'contributeurs' || tab === 'presentation' || tab === 'presentations' || tab === 'slides' || tab === 'cost-followup';
	}

	private _parseSelectedBatchId(selectedBatchId: string | null): string | null {
		if (selectedBatchId === 'all') return null;
		if (selectedBatchId === null) return 'no-zero';
		return selectedBatchId;
	}

	private _serializeSelectedBatchId(selectedBatchId: string | null): string {
		if (selectedBatchId === null) return 'all';
		return selectedBatchId;
	}

	private _parseSelectedYear(selectedYear: string | null): number | null {
		if (!selectedYear) return null;
		const year = Number(selectedYear);
		if (!Number.isInteger(year)) return null;
		return year;
	}

	private _serializeSelectedYear(selectedYear: number | null): string | null {
		if (selectedYear === null) return null;
		return `${selectedYear}`;
	}

	private _comparePrefixValues(aPrefix?: string, bPrefix?: string): number {
		const a = (aPrefix ?? '').trim();
		const b = (bPrefix ?? '').trim();
		if (!a && !b) return 0;
		if (!a) return 1;
		if (!b) return -1;
		return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
	}

	private _buildPrefixSortKey(prefix?: string): string {
		const value = (prefix ?? '').trim();
		if (!value) return 'zzzzzzzz';
		return value.replace(/\d+/g, (digits) => digits.padStart(8, '0')).toLowerCase();
	}
}
