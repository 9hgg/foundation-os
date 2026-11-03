import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { TestBed } from '@angular/core/testing';
import { InteractionTableComponent } from '@foundation/interactions/ui';
import { EMPTY, Subject } from 'rxjs';
import {
	DEFAULT_INTERACTION_SELECTION_MODAL_DATA,
	InteractionSelectionModalData,
	InteractionsSelectionModalComponent,
} from './interactions-selection-modal.component';

const selected = [{ id: 'interaction-1' }];

describe('InteractionsSelectionModalComponent', () => {
	describe('DEFAULT_INTERACTION_SELECTION_MODAL_DATA', () => {
		it('selects exactly one interaction unless the caller says otherwise', () => {
			expect(DEFAULT_INTERACTION_SELECTION_MODAL_DATA.selectionConstraints).toEqual({ maxInteractions: 1, minInteractions: 1, single: true });
		});
	});

	const buildFixture = (data: InteractionSelectionModalData = { interactions: [] }) => {
		const close = vi.fn();

		TestBed.configureTestingModule({
			providers: [
				{ provide: DialogRef, useValue: { close, backdropClick: new Subject<void>(), keydownEvents: new Subject<KeyboardEvent>(), closed: EMPTY, overlayRef: {} } },
				{ provide: DIALOG_DATA, useValue: data },
			],
		});
		// The modal reaches into the real table through viewChild.required, so the table has to be the
		// real component -- only its own template is dropped.
		TestBed.overrideComponent(InteractionTableComponent, { set: { template: '', imports: [], styles: [] } });
		TestBed.overrideComponent(InteractionsSelectionModalComponent, {
			set: { template: '<lib-interaction-table />', imports: [InteractionTableComponent] },
		});

		const fixture = TestBed.createComponent(InteractionsSelectionModalComponent);
		fixture.detectChanges();

		return { fixture, component: fixture.componentInstance, close };
	};

	afterEach(() => TestBed.resetTestingModule());

	it('exposes the data it was opened with', () => {
		const data = { interactions: [], selectionConstraints: { single: false, maxInteractions: 5, minInteractions: 2 } };
		const { component } = buildFixture(data);

		expect(component.interactionSelectionModalData).toBe(data);
	});

	it('forwards the selection bounds to the table', () => {
		const { component } = buildFixture({ interactions: [], selectionConstraints: { single: false, maxInteractions: 5, minInteractions: 2 } });

		expect(component.interactionTableChild().selectedInteractions._max).toBe(5);
		expect(component.interactionTableChild().selectedInteractions._min).toBe(2);
	});

	it("leaves the table's own bounds alone when the caller sets none", () => {
		const { component } = buildFixture();
		const before = { ...component.interactionTableChild().selectedInteractions };

		expect(component.interactionTableChild().selectedInteractions._max).toBe(before._max);
		expect(component.interactionTableChild().selectedInteractions._min).toBe(before._min);
	});

	it('saving closes the dialog with what the table has selected', () => {
		const { component, close } = buildFixture();
		component.interactionTableChild().selectedInteractions.selectMultiple(selected as never);

		component.save();

		expect(close).toHaveBeenCalledWith({ interactions: selected });
	});

	it('cancelling closes the dialog with nothing', () => {
		const { component, close } = buildFixture();

		component.cancel();

		expect(close).toHaveBeenCalledWith();
	});

	it('closing with an explicit result passes it through', () => {
		const { component, close } = buildFixture();

		component.close({ interactions: [] });

		expect(close).toHaveBeenCalledWith({ interactions: [] });
	});
});
