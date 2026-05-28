import { firstValueFrom, of } from 'rxjs';
import { ActivityBuilderPageComponent } from './activity-builder-page.component';

vi.mock('uuid', () => ({ v4: () => 'mock-uuid' }));

function createSignal<T>(initialValue: T) {
	let value = initialValue;
	const signal: any = () => value;
	signal.set = (nextValue: T) => {
		value = nextValue;
	};
	signal.update = (updater: (currentValue: T) => T) => {
		value = updater(value);
	};
	return signal as (() => T) & { set: (value: T) => void; update: (updater: (value: T) => T) => void };
}

describe('ActivityBuilderPageComponent', () => {
	function createComponent() {
		const component = Object.create(ActivityBuilderPageComponent.prototype) as any;
		component.patchableActivity = {
			updateField: vi.fn(),
		};
		component.updateExpandedSelector = { select: vi.fn() };
		component.proposalExpandedSelector = { select: vi.fn() };
		component.notificationService = {
			confirm: vi.fn().mockReturnValue({ closed: of(true) }),
		};
		component._i18n_removeActivityUpdateConfirm = () => 'Remove update?';
		component._i18n_removeActivityUpdateTitle = () => 'Remove update';
		component._i18n_removeActivityUpdateButton = () => 'Remove';
		component._i18n_removeActivityProposalConfirm = () => 'Remove proposal?';
		component._i18n_removeActivityProposalTitle = () => 'Remove proposal';
		component._i18n_removeActivityProposalButton = () => 'Remove';
		component._i18n_removeContributionConfirm = () => 'Remove contribution?';
		component._i18n_removeFacilityUsageConfirm = () => 'Remove usage?';
		component._i18n_removeDeliverableConfirm = () => 'Remove deliverable?';
		component._fileModals = {
			openFilesSelectionDialog: vi.fn().mockReturnValue({ closed: of({ files: [{ id: 'file-1' }, { id: 'file-2' }] }) }),
			openEntityFileDisplayDialog: vi.fn(),
		};
		component._projectsRepository = {
			goToProject: vi.fn(),
		};
		component._annualContributionsModals = {
			openAnnualContributionCreateDialog: vi.fn().mockReturnValue({ closed: of({ activityId: 'activity-1', contributorId: 'contributor-2', year: 2025, days: 12 }) }),
		};
		component._annualFacilityUsagesModals = {
			openAnnualFacilityUsageCreateDialog: vi.fn().mockReturnValue({ closed: of({ activityId: 'activity-1', facilityId: 'facility-2', year: 2025, cost: 55 }) }),
		};
		component._purchasesModals = {
			openPurchaseCreateDialog: vi.fn().mockReturnValue({ closed: of({ title: 'Purchase', year: 2025, activityId: 'activity-1', estimatedCost: 20, supplier: 'ACME', details: 'Details' }) }),
		};
		component._deliverablesModals = {
			openDeliverableSelectDialog: vi.fn().mockReturnValue({ closed: of({ deliverables: [{ id: 'deliverable-2' }] }) }),
			openDeliverableCreateDialog: vi.fn().mockReturnValue({ closed: of({ title: 'New deliverable', description: 'Ready', customerId: 'customer-1', isPrincipal: true }) }),
		};
		component._contributorsModals = {
			openContributorSelectDialog: vi.fn().mockReturnValue({ closed: of({ contributors: [{ id: 'contributor-2' }] }) }),
		};
		component._annualContributionsRepository = {
			store: {
				postObject$: vi.fn().mockReturnValue(of({ ok: true })),
				deleteObject$: vi.fn().mockReturnValue(of({ ok: true })),
				save: vi.fn().mockReturnValue(of({ ok: true })),
			},
		};
		component._annualFacilityUsagesRepository = {
			store: {
				postObject$: vi.fn().mockReturnValue(of({ ok: true })),
				deleteObject$: vi.fn().mockReturnValue(of({ ok: true })),
			},
		};
		component._purchasesRepository = {
			store: {
				postObject$: vi.fn().mockReturnValue(of({ ok: true })),
			},
			goToPurchase: vi.fn(),
		};
		component._activityDeliverablesRepository = {
			store: {
				postObject$: vi.fn().mockReturnValue(of({ ok: true })),
				deleteObject$: vi.fn().mockReturnValue(of({ ok: true })),
			},
		};
		component._deliverablesRepository = {
			store: {
				postObject$: vi.fn().mockReturnValue(of({ result: { data: { id: 'deliverable-created' } } })),
				getObjectByIdPullOnce$$$: vi.fn((id: string) => ({ $: of({ id, title: `Deliverable ${id}` }) })),
			},
			goToDeliverable: vi.fn(),
		};
		component._contributorsRepository = {
			store: {
				getObjectByIdPullOnce$$$: vi.fn((id: string) => ({ $: of({ id, firstName: 'Alice', lastName: 'Martin', category: 'A' }) })),
			},
		};
		component._facilitiesRepository = {
			store: {
				getObjectByIdPullOnce$$$: vi.fn((id: string) => ({ $: of({ id, name: `Facility ${id}` }) })),
			},
		};
		component._projectCostService = {
			getContributionBilledAmountKeur: vi.fn((contribution: any) => contribution.days),
			getFacilityUsageBilledAmountKeur: vi.fn((usage: any) => usage.cost),
			getPurchaseBilledAmountKeur: vi.fn((purchase: any) => purchase.estimatedCost ?? null),
		};
		component._updateContributions$ = { next: vi.fn() };
		component._updateFacilityUsages$ = { next: vi.fn() };
		component._updatePurchases$ = { next: vi.fn() };
		component._updateDeliverables$ = { next: vi.fn() };
		component.activity = createSignal({ id: 'activity-1', batchId: 'batch-1', tags: ['alpha'], config: {} });
		component.project = createSignal({ id: 'project-1' });
		component.projectYears = createSignal([2025, 2026]);
		component.annualContributions = createSignal([{ id: 'contribution-1', activityId: 'activity-1', contributorId: 'contributor-1', year: 2025, days: 10 }]);
		component.annualFacilityUsages = createSignal([{ id: 'usage-1', activityId: 'activity-1', facilityId: 'facility-1', year: 2026, cost: 5 }]);
		component.purchases = createSignal([{ id: 'purchase-1', activityId: 'activity-1', year: 2026, estimatedCost: 2 }]);
		component.activityDeliverables = createSignal([{ id: 'link-1', activityId: 'activity-1', deliverableId: 'deliverable-1' }]);
		component.deliverables = createSignal([{ id: 'deliverable-1', title: 'Deliverable 1' }]);
		component.contributorNames = createSignal({ 'contributor-1': 'Alice Martin' });
		component.contributorCategories = createSignal({ 'contributor-1': 'A' });
		component.facilityNames = createSignal({ 'facility-1': 'Facility 1' });
		component.updateFilesByUpdateId = createSignal({});
		component.proposalFilesByProposalId = createSignal({});
		component.activityUpdates = () => [
			{ id: 'update-1', fileIds: ['existing-file'], links: [{ title: 'Before', url: 'https://before.test' }], sourceKind: 'project', content: 'hello' },
		];
		component.activityProposals = () => [
			{ id: 'proposal-1', fileIds: ['proposal-file'], links: [{ title: 'Question', url: 'https://question.test' }], kind: 'question', content: 'question' },
		];
		return component;
	}

	it('formats values and builds the yearly billed cost table', () => {
		const component = createComponent();

		expect(component._toLocalDateTimeInputValue(new Date('2025-01-02T03:04:00Z'))).toContain('2025-01');
		expect(component._toLocalDateTimeInputValue(undefined)).toBe('');
		expect(component._formatUpdateSourceKind('customer')).toBe('Client');
		expect(component._formatProposalKind('proposal')).toBe('Proposition');
		expect(component._formatKeur(12)).toBe('12');
		expect(component._parseYear('2025-05-01')).toBe(2025);
		expect(component._parseYear('bad-date')).toBeNull();
		expect(component._buildYearRange(2025, 2027)).toEqual([2025, 2026, 2027]);
		expect(component._mergeProjectYearsWithData([2024, 2025], component.annualContributions(), component.annualFacilityUsages(), component.purchases())).toEqual([2024, 2025, 2026]);
		expect(component._splitParagraphs('One\n\n Two ')).toEqual(['One', 'Two']);

		const table = component._buildYearlyBilledCostTable();
		expect(table).toEqual({
			headers: ['Type', '2025', '2026', 'Total'],
			rows: [
				['Human cost', '10k€', '0k€', '10k€'],
				['Expenditures', '0k€', '7k€', '7k€'],
				['Total', '10k€', '7k€', '17k€'],
			],
		});
	});

	it('updates activity updates and files', () => {
		const component = createComponent();

		component.addActivityUpdate();
		component.updateActivityUpdateDate('update-1', '2025-02-01T10:30');
		component.updateActivityUpdateField('update-1', 'title', 'Updated title');
		component.addFilesToActivityUpdate('update-1');
		component.processUploadedFilesForActivityUpdate('update-1', [undefined, { id: 'uploaded-1' }]);
		component.addActivityUpdateLink('update-1');
		component.updateActivityUpdateLink('update-1', 0, 'title', 'Updated link');
		component.removeActivityUpdateLink('update-1', 0);
		component.removeActivityUpdateFile('update-1', 'existing-file');
		component.openActivityUpdateFile({ id: 'file-x' });
		component.removeActivityUpdate('update-1');

		expect(component.updateExpandedSelector.select).toHaveBeenCalledWith('mock-uuid');
		expect(component.patchableActivity.updateField).toHaveBeenCalled();
		expect(component._fileModals.openFilesSelectionDialog).toHaveBeenCalled();
		expect(component._fileModals.openEntityFileDisplayDialog).toHaveBeenCalledWith({ id: 'file-x' });
		expect(component.notificationService.confirm).toHaveBeenCalled();
	});

	it('updates proposals, tags, and proposal files', () => {
		const component = createComponent();

		component.addActivityProposal();
		component.updateActivityProposalDate('proposal-1', '2025-03-01T10:30');
		component.updateActivityProposalField('proposal-1', 'title', 'Updated proposal');
		component.addFilesToActivityProposal('proposal-1');
		component.processUploadedFilesForActivityProposal('proposal-1', [undefined, { id: 'proposal-uploaded' }]);
		component.addActivityProposalLink('proposal-1');
		component.updateActivityProposalLink('proposal-1', 0, 'url', 'https://updated.test');
		component.removeActivityProposalLink('proposal-1', 0);
		component.removeActivityProposalFile('proposal-1', 'proposal-file');
		component.openActivityProposalFile({ id: 'proposal-doc' });
		component.removeActivityProposal('proposal-1');
		component.updateTagsFromString('alpha, beta\nalpha ; gamma');

		expect(component.proposalExpandedSelector.select).toHaveBeenCalledWith('mock-uuid');
		expect(component._fileModals.openEntityFileDisplayDialog).toHaveBeenCalledWith({ id: 'proposal-doc' });
		expect(component.patchableActivity.updateField).toHaveBeenCalledWith('tags', ['alpha', 'beta', 'gamma']);
	});

	it('navigates to presentation routes and handles financial attachments', async () => {
		const component = createComponent();

		component.goToPresentation();
		component.goToPresentationUpdate('update-1');
		component.goToPresentationProposal('proposal-1');
		component.addAnnualContribution();
		component.removeAnnualContribution({ id: 'contribution-1' });
		component.refreshAnnualContributions();
		component.selectContributionContributor({ id: 'contribution-1', contributorId: 'contributor-1' });
		component.addAnnualFacilityUsage();
		component.removeAnnualFacilityUsage({ id: 'usage-1' });
		component.refreshFacilityUsages();
		component.addPurchase();
		component.openPurchase({ id: 'purchase-1' });
		component.refreshPurchases();

		expect(component._projectsRepository.goToProject).toHaveBeenCalledTimes(3);
		expect(component._annualContributionsRepository.store.postObject$).toHaveBeenCalledWith(expect.objectContaining({ contributorId: 'contributor-2' }));
		expect(component._annualContributionsRepository.store.deleteObject$).toHaveBeenCalledWith('contribution-1');
		expect(component._annualContributionsRepository.store.save).toHaveBeenCalledWith(expect.objectContaining({ contributorId: 'contributor-2' }));
		expect(component._annualFacilityUsagesRepository.store.postObject$).toHaveBeenCalledWith(expect.objectContaining({ facilityId: 'facility-2' }));
		expect(component._annualFacilityUsagesRepository.store.deleteObject$).toHaveBeenCalledWith('usage-1');
		expect(component._purchasesRepository.store.postObject$).toHaveBeenCalledWith(expect.objectContaining({ title: 'Purchase' }));
		expect(component._purchasesRepository.goToPurchase).toHaveBeenCalledWith('purchase-1');
	});

	it('attaches, creates, removes, and opens deliverables', async () => {
		const component = createComponent();

		component.attachDeliverable();
		component.createAndAttachDeliverable();
		component.removeDeliverable({ id: 'deliverable-1' });
		component.openDeliverable({ id: 'deliverable-1' });

		expect(component._activityDeliverablesRepository.store.postObject$).toHaveBeenCalled();
		expect(component._deliverablesRepository.store.postObject$).toHaveBeenCalledWith(expect.objectContaining({ title: 'New deliverable' }));
		expect(component._activityDeliverablesRepository.store.deleteObject$).toHaveBeenCalledWith('link-1');
		expect(component._deliverablesRepository.goToDeliverable).toHaveBeenCalledWith('deliverable-1');
	});

	it('exposes display helpers and reloads attachment metadata', async () => {
		const component = createComponent();

		expect(component.getContributorDisplayName('contributor-1')).toBe('Alice Martin');
		expect(component.getContributorDisplayName('missing')).toBe('missing');
		expect(component.getFacilityDisplayName('facility-1')).toBe('Facility 1');
		expect(component.getFacilityDisplayName('missing')).toBe('missing');

		const contributorInfo = await firstValueFrom(component._loadContributorInfo(component.annualContributions()));
		const facilityInfo = await firstValueFrom(component._loadFacilityInfo(component.annualFacilityUsages()));
		const deliverables = await firstValueFrom(component._loadDeliverablesForLinks$(component.activityDeliverables()));

		expect(contributorInfo.names['contributor-1']).toBe('Alice Martin');
		expect(facilityInfo['facility-1']).toBe('Facility facility-1');
		expect(deliverables).toEqual([{ id: 'deliverable-1', title: 'Deliverable deliverable-1' }]);

		component._resetActivityAttachments();
		expect(component.annualContributions()).toEqual([]);
		expect(component.updateFilesByUpdateId()).toEqual({});
	});
});
