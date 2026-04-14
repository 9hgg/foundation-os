import { Injectable } from '@angular/core';
import { Purchase } from '@edf/edf-project-rands/models';
import { GenericRepository } from '@foundation/table/state';

@Injectable({ providedIn: 'root' })
export class PurchasesRepository extends GenericRepository<Purchase> {
	constructor() {
		super('purchases', '/api/edf/rand/purchases');
	}

	public goToPurchase(purchaseId: string | null) {
		this._router.navigate(['/', 'host', 'dashboard', 'purchases', purchaseId, 'builder']);
	}
}
