import { of } from 'rxjs';

const currentTableMock: any = {
	itemsSelector: {
		_min: 0,
		_max: 99,
		selectedItems: [{ id: 'selected-1' }],
		selectMultiple: vi.fn(),
	},
	paginator: {
		setAlwaysOnFilters: vi.fn(),
	},
};

vi.mock('@angular/core', async () => {
	const actual = await vi.importActual<any>('@angular/core');
	return {
		...actual,
		effect: (fn: () => void) => fn(),
		viewChild: {
			required: () => () => currentTableMock,
		},
	};
});

vi.mock('@angular/core/rxjs-interop', () => ({
	takeUntilDestroyed: () => (source: any) => source,
}));

import { ContributorsSelectionModalComponent } from './contributors-selection-modal/contributors-selection-modal.component';
import { CustomersSelectionModalComponent } from './customers-selection-modal/customers-selection-modal.component';
import { DeliverablesSelectionModalComponent } from './deliverables-selection-modal/deliverables-selection-modal.component';
import { FacilitiesSelectionModalComponent } from './facilities-selection-modal/facilities-selection-modal.component';
import { ProjectsSelectionModalComponent } from './projects-selection-modal/projects-selection-modal.component';

describe('edf-project-rands selection modals coverage', () => {
	function createDialogRef() {
		return {
			close: vi.fn(),
			keydownEvents: of({ key: 'Escape' }),
			backdropClick: of(undefined),
			disableClose: false,
		};
	}

	it('covers all selection modals', () => {
		const contributorRef = createDialogRef();
		const contributorModal = new ContributorsSelectionModalComponent(contributorRef as any, {
			selectionConstraints: { single: false, minContributors: 2, maxContributors: 3 },
			filters: [{ fieldName: 'kind', value: 'internal' }] as any,
			alreadySelectedContributors: [{ id: 'contributor-1' }] as any,
		});
		contributorModal.save();
		contributorModal.cancel();

		const customerRef = createDialogRef();
		const customerModal = new CustomersSelectionModalComponent(customerRef as any, {
			selectionConstraints: { single: true, minCustomers: 1, maxCustomers: 1 },
			filters: [{ fieldName: 'identifier', value: 'cust' }] as any,
			alreadySelectedCustomers: [{ id: 'customer-1' }] as any,
		});
		customerModal.save();

		const deliverableRef = createDialogRef();
		const deliverableModal = new DeliverablesSelectionModalComponent(deliverableRef as any, {
			selectionConstraints: { single: true, minDeliverables: 1, maxDeliverables: 2 },
			filters: [{ fieldName: 'title', value: 'deliverable' }] as any,
			alreadySelectedDeliverables: [{ id: 'deliverable-1' }] as any,
		});
		deliverableModal.save();

		const facilityRef = createDialogRef();
		const facilityModal = new FacilitiesSelectionModalComponent(facilityRef as any, {
			selectionConstraints: { single: true, minFacilities: 1, maxFacilities: 2 },
			filters: [{ fieldName: 'name', value: 'facility' }] as any,
			alreadySelectedFacilities: [{ id: 'facility-1' }] as any,
		});
		facilityModal.save();

		const projectRef = createDialogRef();
		const projectModal = new ProjectsSelectionModalComponent(projectRef as any, {
			selectionConstraints: { single: true, minProjects: 1, maxProjects: 2 },
			filters: [{ fieldName: 'name', value: 'project' }] as any,
			alreadySelectedProjects: [{ id: 'project-1' }] as any,
		});
		projectModal.save();

		expect(currentTableMock.itemsSelector.selectMultiple).toHaveBeenCalled();
		expect(currentTableMock.paginator.setAlwaysOnFilters).toHaveBeenCalled();
		expect(contributorRef.disableClose).toBe(true);
		expect(contributorRef.close).toHaveBeenCalledWith({ contributors: [{ id: 'selected-1' }] });
		expect(customerRef.close).toHaveBeenCalledWith({ customers: [{ id: 'selected-1' }] });
		expect(deliverableRef.close).toHaveBeenCalledWith({ deliverables: [{ id: 'selected-1' }] });
		expect(facilityRef.close).toHaveBeenCalledWith({ facilities: [{ id: 'selected-1' }] });
		expect(projectRef.close).toHaveBeenCalledWith({ projects: [{ id: 'selected-1' }] });
	});
});
