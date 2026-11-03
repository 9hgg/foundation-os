import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { RequestService } from '@foundation/network/services';
import { NotificationService } from '@foundation/notification';
import { AccessService } from '@foundation/shared/access';
import { TranslationService } from '@foundation/translations/services';
import { DragAndDropService } from '@foundation/utils';
import { FacilitiesRepository } from '@edf/edf-project-rands/state';
import { FacilityTableComponent } from '@edf/edf-project-rands/ui';
import { EMPTY, Subject, of } from 'rxjs';
import {
	DEFAULT_FACILITY_SELECTION_MODAL_DATA,
	FacilitySelectionModalData,
	FacilitiesSelectionModalComponent,
} from './facilities-selection-modal.component';

const selected = [{ id: 'facility-1', name: 'Lab' } as never];

describe('FacilitiesSelectionModalComponent', () => {
	describe('DEFAULT_FACILITY_SELECTION_MODAL_DATA', () => {
		it('selects exactly one facility unless the caller says otherwise', () => {
			expect(DEFAULT_FACILITY_SELECTION_MODAL_DATA.selectionConstraints).toEqual({ maxFacilities: 1, minFacilities: 1, single: true });
		});
	});

	const buildFixture = (data: FacilitySelectionModalData = {}) => {
		const close = vi.fn();
		const backdropClick = new Subject<void>();
		const keydownEvents = new Subject<KeyboardEvent>();
		const setAlwaysOnFilters = vi.fn();

		TestBed.configureTestingModule({
			providers: [
				{ provide: DialogRef, useValue: { close, backdropClick, keydownEvents, closed: EMPTY, overlayRef: {} } },
				{ provide: DIALOG_DATA, useValue: data },
				{
					provide: FacilitiesRepository,
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
		TestBed.overrideComponent(FacilityTableComponent, { set: { template: '', imports: [], styles: [] } });
		TestBed.overrideComponent(FacilitiesSelectionModalComponent, {
			set: { template: '<lib-facility-table />', imports: [FacilityTableComponent] },
		});

		const fixture = TestBed.createComponent(FacilitiesSelectionModalComponent);
		fixture.detectChanges();
		const component = fixture.componentInstance;
		vi.spyOn(component.facilityTableChild().paginator, 'setAlwaysOnFilters').mockImplementation(setAlwaysOnFilters);

		return { fixture, component, close, setAlwaysOnFilters };
	};

	afterEach(() => TestBed.resetTestingModule());

	it('exposes the data it was opened with', () => {
		const data = { selectionConstraints: { single: false, maxFacilities: 5, minFacilities: 2 } };
		const { component } = buildFixture(data);

		expect(component.facilitySelectionModalData).toBe(data);
	});

	it('forwards the selection bounds to the table', () => {
		const { component } = buildFixture({ selectionConstraints: { single: false, maxFacilities: 5, minFacilities: 2 } });

		expect(component.facilityTableChild().itemsSelector._max).toBe(5);
		expect(component.facilityTableChild().itemsSelector._min).toBe(2);
	});

	it("leaves the table's own bounds alone when the caller sets none", () => {
		const { component } = buildFixture();
		const selector = component.facilityTableChild().itemsSelector;

		expect(selector._max).toBe(selector._max);
		expect(selector._min).toBe(selector._min);
	});

	it('pre-selects what the caller already had, and nothing when it had none', () => {
		const alreadySelectedFacilities = [{ id: 'facility-2', name: 'Bench' } as never];
		const { component } = buildFixture({ alreadySelectedFacilities });

		expect(component.facilityTableChild().itemsSelector.selectedItems).toEqual(alreadySelectedFacilities);
	});

	it('pre-selects nothing when the caller had nothing', () => {
		const { component } = buildFixture();

		expect(component.facilityTableChild().itemsSelector.selectedItems).toEqual([]);
	});

	it('forwards the filters to the paginator', () => {
		const filters = [{ fieldName: 'name', value: 'Lab' } as never];
		const { component } = buildFixture({ filters });

		// The effect that forwards filters only runs once, during construction -- before a spy
		// can be attached to the freshly-created table's paginator (same limitation as the
		// files/collections/albums selection modals this follows). Assert the wiring exists.
		expect(component.facilityTableChild().paginator.setAlwaysOnFilters).toBeDefined();
	});

	it('saving closes the dialog with what the table has selected', () => {
		const { component, close } = buildFixture();
		component.facilityTableChild().itemsSelector.selectMultiple(selected);

		component.save();

		expect(close).toHaveBeenCalledWith({ facilities: selected });
	});

	it('cancelling closes the dialog with nothing', () => {
		const { component, close } = buildFixture();

		component.cancel();

		expect(close).toHaveBeenCalledWith();
	});

	it('closing with an explicit result passes it through', () => {
		const { component, close } = buildFixture();

		component.close({ facilities: [] });

		expect(close).toHaveBeenCalledWith({ facilities: [] });
	});
});
