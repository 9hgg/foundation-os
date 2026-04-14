import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { CustomerCreateModalResult, CustomersModals } from '@edf/edf-project-rands/modals';
import { Customer } from '@edf/edf-project-rands/models';
import { CustomersRepository } from '@edf/edf-project-rands/state';
import { CustomerTableComponent } from '@edf/edf-project-rands/ui';
import { TranslateDirective } from '@foundation/translations/services';
import { of, switchMap, tap } from 'rxjs';
import { v4 as uuidv4 } from 'uuid';

@Component({
	selector: 'lib-customer-list-page',
	standalone: true,
	imports: [TranslateDirective, CustomerTableComponent],
	templateUrl: './customer-list-page.component.html',
	styleUrl: './customer-list-page.component.css',
	changeDetection: ChangeDetectionStrategy.OnPush,
	host: {
		class: 'dashboard-page-host',
	},
})
export class CustomerListPageComponent {
	private _customersModals = inject(CustomersModals);
	public customersRepository = inject(CustomersRepository);

	createNew() {
		return this._customersModals
			.openCustomerCreateDialog()
			.closed.pipe(
				switchMap((result: CustomerCreateModalResult | undefined) => {
					if (!result) return of(null);
					const id = uuidv4();

					const payload: Customer = {
						id: id,
						identifier: result.identifier,
						unit: result.unit,
						referentId: result.referentId,
						technicalReferentId: result.technicalReferentId,
						firstName: result.firstName,
						lastName: result.lastName,
					};

					return this.customersRepository.store.postObject$(payload);
				}),
				tap((c) => {
					const newId = c?.result?.data?.id;
					if (newId) this.customersRepository.goToCustomer(newId);
				})
			)
			.subscribe();
	}
}
