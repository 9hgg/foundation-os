import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, effect, inject, model } from '@angular/core';
import { BehaviorSubjectReplayedProxied } from '@foundation/utils';
import { Contributor } from '@edf/edf-project-rands/models';
import { ContributorsRepository } from '@edf/edf-project-rands/state';
import { of } from 'rxjs';

@Component({
	selector: 'lib-contributor-json-page',
	standalone: true,
	imports: [CommonModule],
	templateUrl: './contributor-json-page.component.html',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ContributorJsonPageComponent {
	private _contributorsRepository = inject(ContributorsRepository);

	public contributorId = model<string | null>(null);

	contributor$$$ = new BehaviorSubjectReplayedProxied<string | null, Contributor | null>((id: string | null) => {
		return id ? this._contributorsRepository.store.getObjectById$$$(id).$ : of(null);
	}, null);

	constructor() {
		effect(() => {
			const id = this.contributorId();
			this.contributor$$$.next(id);
		});
	}
}
