import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, effect, inject, model } from '@angular/core';
import { BehaviorSubjectReplayedProxied } from '@foundation/utils';
import { Facility } from '@edf/edf-project-rands/models';
import { FacilitiesRepository } from '@edf/edf-project-rands/state';
import { of } from 'rxjs';

@Component({
	selector: 'lib-facility-json-page',
	standalone: true,
	imports: [CommonModule],
	templateUrl: './facility-json-page.component.html',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FacilityJsonPageComponent {
	private _facilitiesRepository = inject(FacilitiesRepository);

	public facilityId = model<string | null>(null);

	facility$$$ = new BehaviorSubjectReplayedProxied<string | null, Facility | null>((id: string | null) => {
		return id ? this._facilitiesRepository.store.getObjectById$$$(id).$ : of(null);
	}, null);

	constructor() {
		effect(() => {
			const id = this.facilityId();
			this.facility$$$.next(id);
		});
	}
}
