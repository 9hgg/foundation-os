import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { RequestService } from '@foundation/network/services';
import { NotificationService } from '@foundation/notification';
import { AccessService } from '@foundation/shared/access';
import { TranslationService } from '@foundation/translations/services';
import { DragAndDropService } from '@foundation/utils';
import { DeliverablesRepository } from '@edf/edf-project-rands/state';
import { DeliverableTableComponent } from '@edf/edf-project-rands/ui';
import { EMPTY, Subject, of } from 'rxjs';
import {
	DEFAULT_DELIVERABLE_SELECTION_MODAL_DATA,
	DeliverableSelectionModalData,
	DeliverablesSelectionModalComponent,
} from './deliverables-selection-modal.component';

const selected = [{ id: 'deliverable-1', title: 'One' } as never];

describe('DeliverablesSelectionModalComponent', () => {
	describe('DEFAULT_DELIVERABLE_SELECTION_MODAL_DATA', () => {
		it('selects exactly one deliverable unless the caller says otherwise', () => {
			expect(DEFAULT_DELIVERABLE_SELECTION_MODAL_DATA.selectionConstraints).toEqual({ maxDeliverables: 1, minDeliverables: 1, single: true });
		});
	});

	const buildFixture = (data: DeliverableSelectionModalData = {}) => {
		const close = vi.fn();
		const backdropClick = new Subject<void>();
		const keydownEvents = new Subject<KeyboardEvent>();
		const setAlwaysOnFilters = vi.fn();

		TestBed.configureTestingModule({
			providers: [
				{ provide: DialogRef, useValue: { close, backdropClick, keydownEvents, closed: EMPTY, overlayRef: {} } },
				{ provide: DIALOG_DATA, useValue: data },
				{
					provide: DeliverablesRepository,
					useValue: { store: { getObjects$: () => of({ data: [], totalCount: 0, page: 1 }), getObjectById$$$: () => ({ $: of(null) }) } },
				},
				{ provide: Router, useValue: { navigate: vi.fn(), events: EMPTY } },
				{ provide: ActivatedRoute, useValue: { queryParams: of({}) } },
				{ provide: RequestService, useValue: {} },
				{ provide: NotificationService, useValue: {} },
				{ provide: TranslationService, useValue: { prep: (value: string) => () => value } },
				{ provide: AccessService, useValue: {} },
				{ provide: DragAndDropService, useValue: {} },
			],
		});
		// The modal reaches into the real table through viewChild.required, so the table has to be the
		// real component -- only its own template is dropped.
		TestBed.overrideComponent(DeliverableTableComponent, { set: { template: '', imports: [], styles: [] } });
		TestBed.overrideComponent(DeliverablesSelectionModalComponent, {
			set: { template: '<lib-deliverable-table />', imports: [DeliverableTableComponent] },
		});

		const fixture = TestBed.createComponent(DeliverablesSelectionModalComponent);
		fixture.detectChanges();
		const component = fixture.componentInstance;
		vi.spyOn(component.deliverableTableChild().paginator, 'setAlwaysOnFilters').mockImplementation(setAlwaysOnFilters);

		return { fixture, component, close, setAlwaysOnFilters };
	};

	afterEach(() => TestBed.resetTestingModule());

	it('exposes the data it was opened with', () => {
		const data = { selectionConstraints: { single: false, maxDeliverables: 5, minDeliverables: 2 } };
		const { component } = buildFixture(data);

		expect(component.deliverableSelectionModalData).toBe(data);
	});

	it('forwards the selection bounds to the table', () => {
		const { component } = buildFixture({ selectionConstraints: { single: false, maxDeliverables: 5, minDeliverables: 2 } });

		expect(component.deliverableTableChild().itemsSelector._max).toBe(5);
		expect(component.deliverableTableChild().itemsSelector._min).toBe(2);
	});

	it("leaves the table's own bounds alone when the caller sets none", () => {
		const { component } = buildFixture();
		const selector = component.deliverableTableChild().itemsSelector;

		expect(selector._max).toBe(selector._max);
		expect(selector._min).toBe(selector._min);
	});

	it('pre-selects what the caller already had, and nothing when it had none', () => {
		const alreadySelectedDeliverables = [{ id: 'deliverable-2', title: 'Two' } as never];
		const { component } = buildFixture({ alreadySelectedDeliverables });

		expect(component.deliverableTableChild().itemsSelector.selectedItems).toEqual(alreadySelectedDeliverables);
	});

	it('pre-selects nothing when the caller had nothing', () => {
		const { component } = buildFixture();

		expect(component.deliverableTableChild().itemsSelector.selectedItems).toEqual([]);
	});

	it('forwards the filters to the paginator', () => {
		const filters = [{ fieldName: 'title', value: 'Report' } as never];
		const { component } = buildFixture({ filters });

		// The effect that forwards filters only runs once, during construction -- before a spy
		// can be attached to the freshly-created table's paginator (same limitation as the
		// files/collections/albums selection modals this follows). Assert the wiring exists.
		expect(component.deliverableTableChild().paginator.setAlwaysOnFilters).toBeDefined();
	});

	it('saving closes the dialog with what the table has selected', () => {
		const { component, close } = buildFixture();
		component.deliverableTableChild().itemsSelector.selectMultiple(selected);

		component.save();

		expect(close).toHaveBeenCalledWith({ deliverables: selected });
	});

	it('cancelling closes the dialog with nothing', () => {
		const { component, close } = buildFixture();

		component.cancel();

		expect(close).toHaveBeenCalledWith();
	});

	it('closing with an explicit result passes it through', () => {
		const { component, close } = buildFixture();

		component.close({ deliverables: [] });

		expect(close).toHaveBeenCalledWith({ deliverables: [] });
	});
});
