import { CategoryEnum, Contributor, getDailyCostForCategory, getDailyCostWithOverhead, getOverheadCoefficient } from '@edf/edf-project-rands/models';
import { ContributorsRepository } from '@edf/edf-project-rands/state';
import { Component, computed, effect, inject, input, model, OnDestroy } from '@angular/core';
import { filter, take, takeUntil, tap } from 'rxjs';
import { Subject } from 'rxjs';

@Component({
	selector: 'lib-contributor-cost-pill',
	templateUrl: './contributor-cost-pill.component.html',
	styleUrl: './contributor-cost-pill.component.css',
	standalone: true,
	imports: [],
})
export class ContributorCostPillComponent implements OnDestroy {
	private _contributorsRepository = inject(ContributorsRepository);
	private destroyed$ = new Subject<void>();

	maxLength = input<number | null>(30);
	numberOfdays = input<number | null>(null);
	year = input.required<number>();

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

	contributorCategory = model<CategoryEnum | null>(null);

	private _dailyCost = computed(() => {
		const category = this.contributorCategory();
		if (!category) return null;
		try {
			return Math.round(getDailyCostForCategory(this.year(), category));
		} catch {
			return null;
		}
	});

	private _overheadCoefficient = computed(() => {
		try {
			return getOverheadCoefficient(this.year());
		} catch {
			return null;
		}
	});

	private _dailyBilledAmount = computed(() => {
		const category = this.contributorCategory();
		if (!category) return null;
		try {
			return Math.round(getDailyCostWithOverhead(this.year(), category));
		} catch {
			return null;
		}
	});

	private _billedAmount = computed(() => {
		const days = this.numberOfdays();
		const dailyBilledAmount = this._dailyBilledAmount();
		if (days === null || dailyBilledAmount === null) return null;
		return Math.round((days * dailyBilledAmount) / 10) / 100;
	});

	dailyCostLabel = computed(() => this._dailyCost() ?? '—');
	dailyBilledAmountLabel = computed(() => this._dailyBilledAmount() ?? '—');
	billedAmountLabel = computed(() => this._billedAmount() ?? '—');

	formulaLabel = computed(() => {
		const days = this.numberOfdays();
		const dailyCost = this._dailyCost();
		const overheadCoefficient = this._overheadCoefficient();
		const billedAmount = this._billedAmount();
		const category = this.contributorCategory();
		if (days === null || dailyCost === null || overheadCoefficient === null || billedAmount === null || !category) return '—';
		return `${days} × ${dailyCost}_${category} × ${overheadCoefficient} = ${billedAmount}`;
	});

	formulaHtml = computed(() => {
		const days = this.numberOfdays();
		const dailyCost = this._dailyCost();
		const overheadCoefficient = this._overheadCoefficient();
		const billedAmount = this._billedAmount();
		const category = this.contributorCategory();
		if (days === null || dailyCost === null || overheadCoefficient === null || billedAmount === null || !category) return '—';
		return `${days} × ${dailyCost}<sub>${category}</sub>€ × ${overheadCoefficient} = <strong>${billedAmount}k€</strong>`;
	});

	getBilledAmountKeur(): number | null {
		return this._billedAmount();
	}

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
					tap((contributor) => {
						if (!this) {
							console.warn('ContributorPillComponent: this is undefined, cannot set contributorPublicName');
							return;
						}
						this.setContributorName(contributor);
						this.contributorCategory.set(contributor.category ?? null);
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
