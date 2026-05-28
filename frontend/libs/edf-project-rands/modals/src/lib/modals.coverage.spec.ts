import { DIALOG_DATA, Dialog, DialogRef } from '@angular/cdk/dialog';
import { TestBed } from '@angular/core/testing';
import { BehaviorSubject, of } from 'rxjs';

import { ActivitiesModals } from './activities.modals';
import { AnnualContributionsModals } from './annual-contributions.modals';
import { AnnualFacilityUsagesModals } from './annual-facility-usages.modals';
import { BatchesModals } from './batches.modals';
import { ContributorsModals } from './contributors.modals';
import { CustomersModals } from './customers.modals';
import { DeliverablesModals } from './deliverables.modals';
import { FacilitiesModals } from './facilities.modals';
import { ProjectsModals } from './projects.modals';
import { PurchasesModals } from './purchases.modals';
import { ContributorCreateModalComponent } from './contributor-create-modal/contributor-create-modal.component';
import { CustomerCreateModalComponent } from './customer-create-modal/customer-create-modal.component';
import { FacilityCreateModalComponent } from './facility-create-modal/facility-create-modal.component';
import { DeliverableCreateModalComponent } from './deliverable-create-modal/deliverable-create-modal.component';
import { AnnualContributionCreateModalComponent } from './annual-contribution-create-modal/annual-contribution-create-modal.component';
import { AnnualFacilityUsageCreateModalComponent } from './annual-facility-usage-create-modal/annual-facility-usage-create-modal.component';
import { PurchaseCreateModalComponent } from './purchase-create-modal/purchase-create-modal.component';
import { BatchCreateModalComponent } from './batch-create-modal/batch-create-modal.component';
import { ActivitiesRepository, ProjectsRepository } from '@edf/edf-project-rands/state';

describe('edf-project-rands modals quick coverage', () => {
	function configureProviders(providers: any[]) {
		TestBed.resetTestingModule();
		TestBed.configureTestingModule({ providers });
	}

	it('covers modal service wrappers', () => {
		const dialogRef = { closed: of({ ok: true }) };
		const dialog = { open: vi.fn().mockReturnValue(dialogRef) };
		configureProviders([{ provide: Dialog, useValue: dialog }]);

		const activities = TestBed.runInInjectionContext(() => new ActivitiesModals());
		const annualContributions = TestBed.runInInjectionContext(() => new AnnualContributionsModals());
		const annualFacilityUsages = TestBed.runInInjectionContext(() => new AnnualFacilityUsagesModals());
		const batches = TestBed.runInInjectionContext(() => new BatchesModals());
		const contributors = TestBed.runInInjectionContext(() => new ContributorsModals());
		const customers = TestBed.runInInjectionContext(() => new CustomersModals());
		const deliverables = TestBed.runInInjectionContext(() => new DeliverablesModals());
		const facilities = TestBed.runInInjectionContext(() => new FacilitiesModals());
		const projects = TestBed.runInInjectionContext(() => new ProjectsModals());
		const purchases = TestBed.runInInjectionContext(() => new PurchasesModals());

		activities.openActivityCreateDialog({ projectId: 'project-1' } as any);
		annualContributions.openAnnualContributionCreateDialog({ activityId: 'activity-1' });
		annualFacilityUsages.openAnnualFacilityUsageCreateDialog({ activityId: 'activity-1' });
		batches.openBatchCreateDialog({ title: 'Batch' });
		contributors.openContributorCreateDialog();
		contributors.openContributorSelectDialog({ selectionConstraints: { single: true } } as any);
		contributors.openImportPreviewDialog([{ email: 'alice@example.com' }] as any);
		customers.openCustomerCreateDialog();
		customers.openCustomerSelectDialog({ selectionConstraints: { single: true } } as any);
		deliverables.openDeliverableCreateDialog();
		deliverables.openDeliverableSelectDialog({ selectionConstraints: { single: true } } as any);
		facilities.openFacilityCreateDialog();
		facilities.openFacilitySelectDialog({ selectionConstraints: { single: true } } as any);
		projects.openProjectCreateDialog();
		projects.openProjectSelectDialog({ selectionConstraints: { single: true } } as any);
		purchases.openPurchaseCreateDialog({ title: 'Purchase' });

		expect(dialog.open).toHaveBeenCalledTimes(16);
		expect(dialog.open).toHaveBeenCalledWith(expect.any(Function), expect.objectContaining({ panelClass: 'overflow-auto' }));
	});

	it('covers simple create modals and their save flows', () => {
		const dialogRef = { close: vi.fn() };
		const customersModals = {
			openCustomerSelectDialog: vi.fn().mockReturnValue({ closed: of({ customers: [{ id: 'customer-1' }] }) }),
		};
		const contributorsModals = {
			openContributorSelectDialog: vi.fn().mockReturnValue({ closed: of({ contributors: [{ id: 'contributor-1', firstName: 'Alice' }] }) }),
		};
		const facilitiesModals = {
			openFacilitySelectDialog: vi.fn().mockReturnValue({ closed: of({ facilities: [{ id: 'facility-1', name: 'Lab' }] }) }),
		};
		const activitiesRepository = {
			store: {
				getObjects$: vi.fn().mockReturnValue(of({})),
				objects$$$: new BehaviorSubject<any[]>([null, { id: 'activity-1', title: 'Activity 1' }]),
			},
		};
		const projectsRepository = {
			store: {
				getObjectById$$$: vi.fn().mockReturnValue({ $: of({ id: 'project-1', name: 'Project 1' }) }),
			},
		};
		const projectsModals = {
			openProjectSelectDialog: vi.fn().mockReturnValue({ closed: of({ projects: [{ id: 'project-2', name: 'Project 2' }] }) }),
		};
		const createComponent = <T>(ComponentClass: new () => T, data: unknown = undefined) => {
			configureProviders([
				{ provide: DialogRef, useValue: dialogRef },
				{ provide: DIALOG_DATA, useValue: data },
				{ provide: CustomersModals, useValue: customersModals },
				{ provide: ContributorsModals, useValue: contributorsModals },
				{ provide: FacilitiesModals, useValue: facilitiesModals },
				{ provide: ProjectsModals, useValue: projectsModals },
				{ provide: ActivitiesRepository, useValue: activitiesRepository },
				{ provide: ProjectsRepository, useValue: projectsRepository },
			]);
			return TestBed.runInInjectionContext(() => new ComponentClass());
		};

		const contributor = createComponent(ContributorCreateModalComponent);
		contributor.firstName.set('Alice');
		contributor.lastName.set('Martin');
		contributor.email.set('alice@example.com');
		contributor.unit.set('R&D');
		contributor.save();
		contributor.cancel();

		const customer = createComponent(CustomerCreateModalComponent);
		customer.firstName.set('Bob');
		customer.identifier.set('CUST-1');
		customer.unit.set('EDF');
		customer.save();

		const facility = createComponent(FacilityCreateModalComponent);
		facility.name.set('Lab');
		facility.save();

		const deliverable = createComponent(DeliverableCreateModalComponent);
		deliverable.title.set('Deliverable');
		deliverable.description.set('Ready');
		deliverable.selectCustomer();
		deliverable.clearCustomer();
		deliverable.selectCustomer();
		deliverable.isPrincipal.set(true);
		deliverable.save();

		const annualContribution = createComponent(AnnualContributionCreateModalComponent, { activityId: 'activity-1' });
		annualContribution.selectContributor();
		annualContribution.clearContributor();
		annualContribution.selectContributor();
		annualContribution.days.set(12);
		annualContribution.save();

		const annualFacilityUsage = createComponent(AnnualFacilityUsageCreateModalComponent, { activityId: 'activity-1' });
		annualFacilityUsage.selectFacility();
		annualFacilityUsage.clearFacility();
		annualFacilityUsage.selectFacility();
		annualFacilityUsage.cost.set(450);
		annualFacilityUsage.save();

		const purchase = createComponent(PurchaseCreateModalComponent, {
			activityId: 'activity-1',
			title: 'Purchase',
			year: 2024,
			estimatedCost: 10,
			supplier: 'ACME',
			details: 'Details',
		});
		expect(purchase.activities()).toEqual([{ id: 'activity-1', title: 'Activity 1' }]);
		purchase.title.set('Updated purchase');
		purchase.save();
		purchase.cancel();

		const batch = createComponent(BatchCreateModalComponent, {
			title: 'Batch',
			prefix: 'B',
			description: 'Batch description',
			projectId: 'project-1',
		});
		batch.selectProject();
		batch.clearProject();
		batch.selectProject();
		batch.save();

		expect(customersModals.openCustomerSelectDialog).toHaveBeenCalled();
		expect(contributorsModals.openContributorSelectDialog).toHaveBeenCalled();
		expect(facilitiesModals.openFacilitySelectDialog).toHaveBeenCalled();
		expect(projectsModals.openProjectSelectDialog).toHaveBeenCalled();
		expect(activitiesRepository.store.getObjects$).toHaveBeenCalled();
		expect(projectsRepository.store.getObjectById$$$).toHaveBeenCalledWith('project-1', true);
		expect(dialogRef.close).toHaveBeenCalledWith(expect.objectContaining({ firstName: 'Alice', lastName: 'Martin' }));
		expect(dialogRef.close).toHaveBeenCalledWith(expect.objectContaining({ identifier: 'CUST-1' }));
		expect(dialogRef.close).toHaveBeenCalledWith(expect.objectContaining({ name: 'Lab' }));
		expect(dialogRef.close).toHaveBeenCalledWith(expect.objectContaining({ title: 'Deliverable', isPrincipal: true }));
		expect(dialogRef.close).toHaveBeenCalledWith(expect.objectContaining({ activityId: 'activity-1', contributorId: 'contributor-1', days: 12 }));
		expect(dialogRef.close).toHaveBeenCalledWith(expect.objectContaining({ activityId: 'activity-1', facilityId: 'facility-1', cost: 450 }));
		expect(dialogRef.close).toHaveBeenCalledWith(expect.objectContaining({ title: 'Updated purchase', activityId: 'activity-1' }));
		expect(dialogRef.close).toHaveBeenCalledWith(expect.objectContaining({ title: 'Batch', projectId: 'project-2' }));
	});
});
