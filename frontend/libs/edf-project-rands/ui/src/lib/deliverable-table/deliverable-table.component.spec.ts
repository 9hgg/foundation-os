import { EventEmitter } from '@angular/core';
import { of } from 'rxjs';
import { DeliverableTableComponent } from './deliverable-table.component';

describe('deliverable-table.component', () => {
	const deliverable = {
		id: 'deliverable-1',
		title: 'Final report',
		isPrincipal: true,
	};

	const buildComponent = () => {
		const refresh = vi.fn(() => of(null));
		const deleteObject$ = vi.fn(() => of({ result: {} }));
		const confirm = vi.fn(() => ({ closed: of(true) }));
		const shareWithTeam = vi.fn();
		const openSharingDetails = vi.fn();
		const component = Object.create(DeliverableTableComponent.prototype) as DeliverableTableComponent;

		component['_repository'] = { store: { deleteObject$ } } as never;
		component['_notificationService'] = { confirm } as never;
		component['_i18n_deleteSentence'] = () => 'Are you sure you want to delete this deliverable?';
		component['_accessService'] = { shareWithTeam, openSharingDetails } as never;
		component.paginator = { refresh } as never;
		component.detachRequested = new EventEmitter();

		return { component, confirm, deleteObject$, refresh, shareWithTeam, openSharingDetails };
	};

	it('deletes a deliverable only after confirmation and refreshes the paginator', () => {
		const { component, confirm, deleteObject$, refresh } = buildComponent();

		component.deleteDeliverable(deliverable);

		expect(confirm).toHaveBeenCalledWith('Are you sure you want to delete this deliverable?');
		expect(deleteObject$).toHaveBeenCalledWith('deliverable-1');
		expect(refresh).toHaveBeenCalled();
	});

	it('skips deletion when confirmation is rejected', () => {
		const { component, deleteObject$, confirm } = buildComponent();
		confirm.mockReturnValue({ closed: of(false) });

		component.deleteDeliverable(deliverable);

		expect(deleteObject$).not.toHaveBeenCalled();
	});

	it('shares a deliverable with the team', () => {
		const { component, shareWithTeam } = buildComponent();

		component.shareWithTeam(deliverable);

		expect(shareWithTeam).toHaveBeenCalledWith('deliverable-1', 'deliverable');
	});

	it('opens the sharing details for a deliverable', () => {
		const { component, openSharingDetails } = buildComponent();

		component.openSharingDetails(deliverable);

		expect(openSharingDetails).toHaveBeenCalledWith('deliverable-1', 'deliverable');
	});

	it('emits a detach request for the deliverable', () => {
		const { component } = buildComponent();
		const detached: unknown[] = [];
		component.detachRequested.subscribe((d) => detached.push(d));

		component.requestDetach(deliverable);

		expect(detached).toEqual([deliverable]);
	});
});
