import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, effect, inject, model } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterModule, ActivatedRoute } from '@angular/router';
import { NotificationService } from '@foundation/notification';
import { TranslateDirective } from '@foundation/translations/services';
import { PatchableItem } from '@foundation/utils';
import { Contributor } from '@edf/edf-project-rands/models';
import { ContributorsRepository } from '@edf/edf-project-rands/state';
import { of } from 'rxjs';

@Component({
	selector: 'lib-contributor-builder-page',
	standalone: true,
	imports: [CommonModule, FormsModule, TranslateDirective, RouterModule],
	templateUrl: './contributor-builder-page.component.html',
	styleUrls: ['./contributor-builder-page.component.css'],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ContributorsBuilderPageComponent {
	public notificationService = inject(NotificationService);
	private _contributorsRepository = inject(ContributorsRepository);

	public contributorId = model<string | null>(null);

	patchableContributor = new PatchableItem<Contributor>(
		this.contributorId,
		(id) => (id ? this._contributorsRepository.store.getObjectByIdPullOnce$$$(id).$ : of(null)),
		(contributorId, patch) => this._contributorsRepository.store.applyPatch(contributorId, patch)
	);
	contributor = this.patchableContributor.patchedItem;

	constructor() {
		const _route = inject(ActivatedRoute);

		// update contributorId when route changes
		_route.paramMap.subscribe((pm) => {
			this.contributorId.set(pm.get('contributorId'));
		});
	}
}
