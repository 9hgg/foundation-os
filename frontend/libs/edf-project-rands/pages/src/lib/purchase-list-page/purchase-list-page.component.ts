import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { PurchaseCreateModalResult, PurchasesModals } from '@edf/edf-project-rands/modals';
import { Purchase } from '@edf/edf-project-rands/models';
import { PurchasesRepository } from '@edf/edf-project-rands/state';
import { PurchaseTableComponent } from '@edf/edf-project-rands/ui';
import { TranslateDirective } from '@foundation/translations/services';
import { of, switchMap, tap } from 'rxjs';
import { v4 as uuidv4 } from 'uuid';

@Component({
	selector: 'lib-purchase-list-page',
	standalone: true,
	imports: [TranslateDirective, PurchaseTableComponent],
	templateUrl: './purchase-list-page.component.html',
	styleUrl: './purchase-list-page.component.css',
	changeDetection: ChangeDetectionStrategy.OnPush,
	host: {
		class: 'dashboard-page-host',
	},
})
export class PurchaseListPageComponent {
	purchasesRepository = inject(PurchasesRepository);
	private _purchasesModals = inject(PurchasesModals);
	public createNew() {
		return this._purchasesModals
			.openPurchaseCreateDialog()
			.closed.pipe(
				switchMap((result: PurchaseCreateModalResult | undefined) => {
					if (!result) return of(null);
					const id = uuidv4();

					const payload: Purchase = {
						id: id,
						year:result.year,
						title: result.title,
						activityId: result.activityId,
						details: result.details,
						estimatedCost: result.estimatedCost,
						supplier: result.supplier,
					};

					return this.purchasesRepository.store.postObject$(payload);
				}),
				tap((r) => {
					const newId = r?.result?.data?.id;
					if (newId) this.purchasesRepository.goToPurchase(newId);
				})
			)
			.subscribe();
	}
}
