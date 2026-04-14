import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { DeliverableCreateModalResult, DeliverablesModals } from '@edf/edf-project-rands/modals';
import { Deliverable } from '@edf/edf-project-rands/models';
import { DeliverablesRepository } from '@edf/edf-project-rands/state';
import { DeliverableTableComponent } from '@edf/edf-project-rands/ui';
import { TranslateDirective } from '@foundation/translations/services';
import { of, switchMap, tap } from 'rxjs';
import { v4 as uuidv4 } from 'uuid';

@Component({
	selector: 'lib-deliverable-list-page',
	standalone: true,
	imports: [TranslateDirective, DeliverableTableComponent],
	templateUrl: './deliverable-list-page.component.html',
	styleUrl: './deliverable-list-page.component.css',
	changeDetection: ChangeDetectionStrategy.OnPush,
	host: {
		class: 'dashboard-page-host',
	},
})
export class DeliverableListPageComponent {
	private _deliverablesModals = inject(DeliverablesModals);
	public deliverablesRepository = inject(DeliverablesRepository);

	createNew() {
		return this._deliverablesModals
			.openDeliverableCreateDialog()
			.closed.pipe(
				switchMap((result: DeliverableCreateModalResult | undefined) => {
					if (!result) return of(null);
					const id = uuidv4();

					const payload: Deliverable = {
						id: id,
						title: result.title,
						description: result.description,
						customerId: result.customerId,
						startDate: result.startDate,
						endDate: result.endDate,
						isPrincipal: result.isPrincipal || false,
						hidden: false,
					};

					return this.deliverablesRepository.store.postObject$(payload);
				}),
				tap((c) => {
					const newId = c?.result?.data?.id;
					if (newId) this.deliverablesRepository.goToDeliverable(newId);
				})
			)
			.subscribe();
	}
}
