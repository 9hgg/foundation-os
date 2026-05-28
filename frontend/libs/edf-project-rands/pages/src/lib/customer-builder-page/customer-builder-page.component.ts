import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, effect, inject, model } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterModule, ActivatedRoute } from '@angular/router';
import { NotificationService } from '@foundation/notification';
import { TranslateDirective } from '@foundation/translations/services';
import { BehaviorSubjectReplayedProxied } from '@foundation/utils';
import { Customer } from '@edf/edf-project-rands/models';
import { CustomersRepository } from '@edf/edf-project-rands/state';
import { of } from 'rxjs';

@Component({
	selector: 'lib-customer-builder-page',
	standalone: true,
	imports: [CommonModule, FormsModule, TranslateDirective, RouterModule],
	templateUrl: './customer-builder-page.component.html',
	styleUrls: ['./customer-builder-page.component.css'],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CustomerBuilderPageComponent {
	public notificationService = inject(NotificationService);
	private _customersRepository = inject(CustomersRepository);

	public customerId = model<string | null>(null);

	customer$$$ = new BehaviorSubjectReplayedProxied<string | null, Customer | null>((id: string | null) => {
		return id ? this._customersRepository.store.getObjectByIdPullOnce$$$(id).$ : of(null);
	}, null);

	constructor() {
		const _route = inject(ActivatedRoute);
		_route.paramMap.subscribe((pm) => this.customerId.set(pm.get('customerId')));

		effect(() => {
			const id = this.customerId();
			this.customer$$$.next(id);
		});
	}

	updateNames(first: string, last: string) {
		const c = this.customer$$$.value;
		if (!c) return;
		c.firstName = first;
		c.lastName = last;
		this._customersRepository.store.save(c);
	}

	updateIdentifier(identifier: string) {
		const c = this.customer$$$.value;
		if (!c) return;
		c.identifier = identifier;
		this._customersRepository.store.save(c);
	}

	updateUnit(unit: string) {
		const c = this.customer$$$.value;
		if (!c) return;
		c.unit = unit;
		this._customersRepository.store.save(c);
	}
}
