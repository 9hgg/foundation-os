import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, effect, inject, model } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterModule, ActivatedRoute } from '@angular/router';
import { NotificationService } from '@foundation/notification';
import { TranslateDirective } from '@foundation/translations/services';
import { BehaviorSubjectReplayedProxied } from '@foundation/utils';
import { Purchase } from '@edf/edf-project-rands/models';
import { PurchasesRepository } from '@edf/edf-project-rands/state';
import { of } from 'rxjs';

@Component({
	selector: 'lib-purchase-builder-page',
	standalone: true,
	imports: [CommonModule, FormsModule, TranslateDirective, RouterModule],
	templateUrl: './purchase-builder-page.component.html',
	styleUrls: ['./purchase-builder-page.component.css'],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PurchaseBuilderPageComponent {
	public notificationService = inject(NotificationService);
	private _purchasesRepository = inject(PurchasesRepository);

	public purchaseId = model<string | null>(null);

	purchase$$$ = new BehaviorSubjectReplayedProxied<string | null, Purchase | null>((id: string | null) => {
		return id ? this._purchasesRepository.store.getObjectById$$$(id, true).$ : of(null);
	}, null);

	constructor() {
		const _route = inject(ActivatedRoute);
		_route.paramMap.subscribe((pm) => this.purchaseId.set(pm.get('purchaseId')));

		effect(() => {
			const id = this.purchaseId();
			this.purchase$$$.next(id);
		});
	}

	updateTitle(title: string) {
		const p = this.purchase$$$.value;
		if (!p) return;
		p.title = title;
		this._purchasesRepository.store.save(p);
	}

	updateEstimatedCost(cost: number) {
		const p = this.purchase$$$.value;
		if (!p) return;
		p.estimatedCost = cost;
		this._purchasesRepository.store.save(p);
	}
}
