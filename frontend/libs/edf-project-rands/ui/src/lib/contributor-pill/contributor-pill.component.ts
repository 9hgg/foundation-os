import { Contributor } from '@edf/edf-project-rands/models';
import { ContributorsRepository } from '@edf/edf-project-rands/state';
import { Component, computed, effect, inject, input, model, OnDestroy } from '@angular/core';
import { filter, take, takeUntil, tap } from 'rxjs';
import { Subject } from 'rxjs';

@Component({
	selector: 'lib-contributor-pill',
	templateUrl: './contributor-pill.component.html',
	styleUrl: './contributor-pill.component.css',
	standalone: true,
})
export class ContributorPillComponent implements OnDestroy {
	private _contributorsRepository = inject(ContributorsRepository);
	private destroyed$ = new Subject<void>();

	maxLength = input<number | null>(30);

	contributor = input<Contributor | null>(null);
	contributorId = input<string | null>(null);

	contributorPublicName = model<string>('someone');

	contributorPublicNameTruncated = computed(() => {
		const contributorPublicName = this.contributorPublicName();
		const maxLength = this.maxLength();
		if (maxLength && contributorPublicName.length > maxLength) {
			return contributorPublicName.substring(0, maxLength) + '...';
		}
		return contributorPublicName;
	});

	constructor() {
		effect(() => {
			const contributorId = this.contributorId();
			const contributor = this.contributor();
			const contributorId_ = contributorId ?? contributor?.id ?? null;

			if (!contributorId_) {
				this.setContributorName(contributor ?? null);
				return;
			}

			this._contributorsRepository.store
				.getObjectById$$$(contributorId_, true)
				.$.pipe(
					filter((a) => !!a),
					take(1),
					takeUntil(this.destroyed$),
					tap((a) => {
						if (!this) {
							console.warn('ContributorPillComponent: this is undefined, cannot set contributorPublicName');
							return;
						}
						this.setContributorName(a);
					})
				)
				.subscribe();
		});
	}

	private setContributorName(contributor: Contributor | null) {
		if (!contributor) return;
		const fullName = `${contributor.firstName ?? ''} ${contributor.lastName ?? ''}`.trim();
		if (fullName) this.contributorPublicName.set(fullName);
		else if (contributor.email) this.contributorPublicName.set(contributor.email);
		else this.contributorPublicName.set(contributor.id);
	}

	ngOnDestroy(): void {
		this.destroyed$.next();
		this.destroyed$.complete();
	}
}
