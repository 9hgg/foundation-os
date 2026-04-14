import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, effect, inject, model } from '@angular/core';
import { BehaviorSubjectReplayedProxied } from '@foundation/utils';
import { Batch } from '@edf/edf-project-rands/models';
import { BatchesRepository } from '@edf/edf-project-rands/state';
import { of } from 'rxjs';

@Component({
	selector: 'lib-batch-json-page',
	standalone: true,
	imports: [CommonModule],
	templateUrl: './batch-json-page.component.html',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BatchJsonPageComponent {
	private _batchesRepository = inject(BatchesRepository);

	public batchId = model<string | null>(null);

	batch$$$ = new BehaviorSubjectReplayedProxied<string | null, Batch | null>((id: string | null) => {
		return id ? this._batchesRepository.store.getObjectById$$$(id).$ : of(null);
	}, null);

	constructor() {
		effect(() => {
			const id = this.batchId();
			this.batch$$$.next(id);
		});
	}
}
