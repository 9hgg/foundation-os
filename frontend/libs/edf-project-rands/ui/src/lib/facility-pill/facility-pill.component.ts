import { Facility } from '@edf/edf-project-rands/models';
import { FacilitiesRepository } from '@edf/edf-project-rands/state';
import { Component, computed, effect, inject, input, model, OnDestroy } from '@angular/core';
import { filter, take, takeUntil, tap } from 'rxjs';
import { Subject } from 'rxjs';

@Component({
	selector: 'lib-facility-pill',
	templateUrl: './facility-pill.component.html',
	styleUrl: './facility-pill.component.css',
	standalone: true,
})
export class FacilityPillComponent implements OnDestroy {
	private _facilitiesRepository = inject(FacilitiesRepository);
	private destroyed$ = new Subject<void>();

	maxLength = input<number | null>(30);

	facility = input<Facility | null>(null);
	facilityId = input<string | null>(null);

	facilityPublicName = model<string>('facility');

	facilityPublicNameTruncated = computed(() => {
		const facilityPublicName = this.facilityPublicName();
		const maxLength = this.maxLength();
		if (maxLength && facilityPublicName.length > maxLength) {
			return facilityPublicName.substring(0, maxLength) + '...';
		}
		return facilityPublicName;
	});

	constructor() {
		effect(() => {
			const facilityId = this.facilityId();
			const facility = this.facility();
			const facilityId_ = facilityId ?? facility?.id ?? null;

			if (!facilityId_) {
				this.setFacilityName(facility ?? null);
				return;
			}

			this._facilitiesRepository.store
				.getObjectById$$$(facilityId_, true)
				.$.pipe(
					filter((a) => !!a),
					take(1),
					takeUntil(this.destroyed$),
					tap((a) => {
						if (!this) {
							console.warn('FacilityPillComponent: this is undefined, cannot set facilityPublicName');
							return;
						}
						this.setFacilityName(a);
					})
				)
				.subscribe();
		});
	}

	private setFacilityName(facility: Facility | null) {
		if (!facility) return;
		if (facility.name) this.facilityPublicName.set(facility.name);
		else this.facilityPublicName.set(facility.id);
	}

	ngOnDestroy(): void {
		this.destroyed$.next();
		this.destroyed$.complete();
	}
}
