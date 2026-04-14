import { ChangeDetectionStrategy, Component, inject, input, model } from '@angular/core';
import { Batch } from '@edf/edf-project-rands/models';
import { BatchesRepository } from '@edf/edf-project-rands/state';
import { TranslateDirective } from '@foundation/translations/services';

@Component({
	selector: 'lib-project-batch-selector',
	standalone: true,
	imports: [TranslateDirective],
	templateUrl: './project-batch-selector.component.html',
	styleUrls: ['./project-batch-selector.component.css'],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProjectBatchSelectorComponent {
	private _batchesRepository = inject(BatchesRepository);

	batches = input<Batch[]>([]);
	selectedBatchId = model<string | null>('no-zero');

	navigateToBatch(event: Event, batch: Batch) {
		event.preventDefault();
		event.stopPropagation();
		this._batchesRepository.goToBatch(batch.id);
	}
}
