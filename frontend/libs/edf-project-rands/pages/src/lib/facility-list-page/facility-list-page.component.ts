import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FacilitiesModals } from '@edf/edf-project-rands/modals';
import { Facility } from '@edf/edf-project-rands/models';
import { FacilitiesRepository } from '@edf/edf-project-rands/state';
import { FacilityTableComponent } from '@edf/edf-project-rands/ui';
import { TranslateDirective } from '@foundation/translations/services';
import { of, switchMap, tap } from 'rxjs';
import { v4 as uuidv4 } from 'uuid';

@Component({
	selector: 'lib-facility-list-page',
	standalone: true,
	imports: [TranslateDirective, FacilityTableComponent],
	templateUrl: './facility-list-page.component.html',
	styleUrl: './facility-list-page.component.css',
	changeDetection: ChangeDetectionStrategy.OnPush,
	host: {
		class: 'dashboard-page-host',
	},
})
export class FacilityListPageComponent {
	facilitiesRepository = inject(FacilitiesRepository);

	private _facilitiesModals = inject(FacilitiesModals);

	public createNew() {
		return this._facilitiesModals.openFacilityCreateDialog().closed.pipe(
			switchMap((result) => {
				if (!result) return of(null);
				const id = uuidv4();

				const payload: Facility = {
					id: id,
					name: result.name,
					type: result.type,
				};

				return this.facilitiesRepository.store.postObject$(payload);
			}),
			tap((r) => {
				const newId = r?.result?.data?.id;
				if (newId) this.facilitiesRepository.goToFacility(newId);
			})
		).subscribe();
	}
}
