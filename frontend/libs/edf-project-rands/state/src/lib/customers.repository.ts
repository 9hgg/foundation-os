import { Injectable } from '@angular/core';
import { Customer } from '@edf/edf-project-rands/models';
import { GenericRepository } from '@foundation/table/state';

@Injectable({ providedIn: 'root' })
export class CustomersRepository extends GenericRepository<Customer> {
	constructor() {
		super('customers', '/api/edf/rand/customers');
	}

	public goToCustomer(customerId: string | null) {
		if (!customerId) {
			this._router.navigate(['/', 'host', 'dashboard', 'customers']);
			return;
		}
		this._router.navigate(['/', 'host', 'dashboard', 'customers', customerId, 'builder']);
	}
}
