import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, effect, inject, model } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterModule, ActivatedRoute } from '@angular/router';
import { NotificationService } from '@foundation/notification';
import { TranslateDirective } from '@foundation/translations/services';
import { BehaviorSubjectReplayedProxied } from '@foundation/utils';
import { Facility } from '@edf/edf-project-rands/models';
import { FacilitiesRepository } from '@edf/edf-project-rands/state';
import { of } from 'rxjs';

@Component({
	selector: 'lib-facility-builder-page',
	standalone: true,
	imports: [CommonModule, FormsModule, TranslateDirective, RouterModule],
	templateUrl: './facility-builder-page.component.html',
	styleUrls: ['./facility-builder-page.component.css'],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FacilityBuilderPageComponent {
	public notificationService = inject(NotificationService);
	private _facilitiesRepository = inject(FacilitiesRepository);

	public facilityId = model<string | null>(null);

	facility$$$ = new BehaviorSubjectReplayedProxied<string | null, Facility | null>((id: string | null) => {
		return id ? this._facilitiesRepository.store.getObjectById$$$(id, true).$ : of(null);
	}, null);

	constructor() {
		const _route = inject(ActivatedRoute);

		// update facilityId when route changes
		_route.paramMap.subscribe((pm) => {
			this.facilityId.set(pm.get('facilityId'));
		});

		effect(() => {
			const id = this.facilityId();
			this.facility$$$.next(id);
		});
	}

	updateName(name: string) {
		const f = this.facility$$$.value;
		if (!f) return;
		f.name = name;
		this._facilitiesRepository.store.save(f);
	}

	updateType(type: string) {
		const f = this.facility$$$.value;
		if (!f) return;
		f.type = type as any;
		this._facilitiesRepository.store.save(f);
	}
}
