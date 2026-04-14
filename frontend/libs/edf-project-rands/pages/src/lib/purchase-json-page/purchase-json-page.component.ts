import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, effect, inject, model } from '@angular/core';
import { BehaviorSubjectReplayedProxied } from '@foundation/utils';
import { Purchase } from '@edf/edf-project-rands/models';
import { PurchasesRepository } from '@edf/edf-project-rands/state';
import { of } from 'rxjs';

@Component({
	selector: 'lib-purchase-json-page',
	standalone: true,
	imports: [CommonModule],
	templateUrl: './purchase-json-page.component.html',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PurchaseJsonPageComponent {
	private _purchasesRepository = inject(PurchasesRepository);

	public purchaseId = model<string | null>(null);

	purchase$$$ = new BehaviorSubjectReplayedProxied<string | null, Purchase | null>((id: string | null) => {
		return id ? this._purchasesRepository.store.getObjectById$$$(id).$ : of(null);
	}, null);

	constructor() {
		effect(() => {
			const id = this.purchaseId();
			this.purchase$$$.next(id);
		});
	}
}
