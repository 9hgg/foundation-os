import { Customer } from '@edf/edf-project-rands/models';
import { CustomersRepository } from '@edf/edf-project-rands/state';
import { Component, computed, effect, inject, input, model, OnDestroy } from '@angular/core';
import { filter, take, takeUntil, tap } from 'rxjs';
import { Subject } from 'rxjs';

@Component({
	selector: 'lib-customer-pill',
	templateUrl: './customer-pill.component.html',
	styleUrl: './customer-pill.component.css',
	standalone: true,
})
export class CustomerPillComponent implements OnDestroy {
	private _customersRepository = inject(CustomersRepository);
	private destroyed$ = new Subject<void>();

	maxLength = input<number | null>(30);

	customer = input<Customer | null>(null);
	customerId = input<string | null>(null);

	customerPublicName = model<string>('customer');

	customerPublicNameTruncated = computed(() => {
		const customerPublicName = this.customerPublicName();
		const maxLength = this.maxLength();
		if (maxLength && customerPublicName.length > maxLength) {
			return customerPublicName.substring(0, maxLength) + '...';
		}
		return customerPublicName;
	});

	constructor() {
		effect(() => {
			const customerId = this.customerId();
			const customer = this.customer();
			const customerId_ = customerId ?? customer?.id ?? null;

			if (!customerId_) {
				this.setCustomerName(customer ?? null);
				return;
			}

			this._customersRepository.store
				.getObjectById$$$(customerId_, true)
				.$.pipe(
					filter((a) => !!a),
					take(1),
					takeUntil(this.destroyed$),
					tap((a) => {
						if (!this) {
							console.warn('CustomerPillComponent: this is undefined, cannot set customerPublicName');
							return;
						}
						this.setCustomerName(a);
					})
				)
				.subscribe();
		});
	}

	private setCustomerName(customer: Customer | null) {
		if (!customer) return;
		const fullName = `${customer.firstName ?? ''} ${customer.lastName ?? ''}`.trim();
		if (fullName) this.customerPublicName.set(fullName);
		else if (customer.identifier) this.customerPublicName.set(customer.identifier);
		else this.customerPublicName.set(customer.id);
	}

	ngOnDestroy(): void {
		this.destroyed$.next();
		this.destroyed$.complete();
	}
}
