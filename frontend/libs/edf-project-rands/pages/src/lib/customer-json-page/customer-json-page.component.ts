import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, effect, inject, model } from '@angular/core';
import { BehaviorSubjectReplayedProxied } from '@foundation/utils';
import { Customer } from '@edf/edf-project-rands/models';
import { CustomersRepository } from '@edf/edf-project-rands/state';
import { of } from 'rxjs';

@Component({
	selector: 'lib-customer-json-page',
	standalone: true,
	imports: [CommonModule],
	templateUrl: './customer-json-page.component.html',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CustomerJsonPageComponent {
	private _customersRepository = inject(CustomersRepository);

	public customerId = model<string | null>(null);

	customer$$$ = new BehaviorSubjectReplayedProxied<string | null, Customer | null>((id: string | null) => {
		return id ? this._customersRepository.store.getObjectById$$$(id).$ : of(null);
	}, null);

	constructor() {
		effect(() => {
			const id = this.customerId();
			this.customer$$$.next(id);
		});
	}
}
