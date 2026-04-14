import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { BatchesModals } from '@edf/edf-project-rands/modals';
import { Batch } from '@edf/edf-project-rands/models';
import { BatchesRepository } from '@edf/edf-project-rands/state';
import { BatchTableComponent } from '@edf/edf-project-rands/ui';
import { TranslateDirective } from '@foundation/translations/services';
import { of, switchMap, tap } from 'rxjs';
import { v4 as uuidv4 } from 'uuid';

@Component({
	selector: 'lib-batch-list-page',
	standalone: true,
	imports: [TranslateDirective, BatchTableComponent],
	templateUrl: './batch-list-page.component.html',
	styleUrl: './batch-list-page.component.css',
	changeDetection: ChangeDetectionStrategy.OnPush,
	host: {
		class: 'dashboard-page-host',
	},
})
export class BatchListPageComponent {
	batchesRepository = inject(BatchesRepository);

	private _batchesModals = inject(BatchesModals);

	public createNew() {
		return this._batchesModals
			.openBatchCreateDialog()
			.closed.pipe(
				switchMap((result) => {
					if (!result) return of(null);
					const id = uuidv4();

					const payload: Batch = {
						id: id,
						title: result.title,
						prefix: result.prefix,
						projectId: result.projectId,
					};

					return this.batchesRepository.store.postObject$(payload);
				}),
				tap((r) => {
					const newId = r?.result?.data?.id;
					if (newId) this.batchesRepository.goToBatch(newId);
				})
			)
			.subscribe();
	}
}
