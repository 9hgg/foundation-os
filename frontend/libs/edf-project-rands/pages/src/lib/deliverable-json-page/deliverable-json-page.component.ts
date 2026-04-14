import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, effect, inject, model } from '@angular/core';
import { BehaviorSubjectReplayedProxied } from '@foundation/utils';
import { Deliverable } from '@edf/edf-project-rands/models';
import { DeliverablesRepository } from '@edf/edf-project-rands/state';
import { of } from 'rxjs';

@Component({
	selector: 'lib-deliverable-json-page',
	standalone: true,
	imports: [CommonModule],
	templateUrl: './deliverable-json-page.component.html',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DeliverableJsonPageComponent {
	private _deliverablesRepository = inject(DeliverablesRepository);

	public deliverableId = model<string | null>(null);

	deliverable$$$ = new BehaviorSubjectReplayedProxied<string | null, Deliverable | null>((id: string | null) => {
		return id ? this._deliverablesRepository.store.getObjectById$$$(id).$ : of(null);
	}, null);

	constructor() {
		effect(() => {
			const id = this.deliverableId();
			this.deliverable$$$.next(id);
		});
	}
}
