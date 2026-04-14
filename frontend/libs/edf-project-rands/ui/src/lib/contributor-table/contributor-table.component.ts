/* eslint-disable @angular-eslint/prefer-inject */
import { Contributor } from '@edf/edf-project-rands/models';
import { ContributorsRepository } from '@edf/edf-project-rands/state';
import { BehaviorType, RepositoryTableComponent } from '@foundation/table/ui';
import { TranslateDirective, TranslatePipe } from '@foundation/translations/services';
import { CdkMenu, CdkMenuItem, CdkMenuModule } from '@angular/cdk/menu';
import { CommonModule } from '@angular/common';
import { Attribute, ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { switchMap } from 'rxjs';
import { AccessService } from '@foundation/shared/access';

@Component({
	selector: 'lib-contributor-table',
	standalone: true,
	imports: [
		CommonModule,
		TranslateDirective,
		TranslatePipe,
		ReactiveFormsModule,
		FormsModule,
		CdkMenuModule,
		CdkMenu,
		CdkMenuItem,
	],
	templateUrl: './contributor-table.component.html',
	styleUrl: './contributor-table.component.css',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ContributorTableComponent extends RepositoryTableComponent<Contributor, ContributorsRepository> {
	private _accessService = inject(AccessService);

	constructor(
		private _repository: ContributorsRepository,
		@Attribute('click-behavior') clickBehavior: BehaviorType
	) {
		super(
			_repository,
			{
				orderingBy: { fieldName: 'timeCreated', direction: 'desc' },
				alwaysOnFilters: [],
			},
			clickBehavior
		);
	}

	private _i18n_deleteSentence = this._translationService.prep('Are you sure you want to delete this contributor?');
	public deleteContributor(contributor: Contributor) {
		this._notificationService.confirm(this._i18n_deleteSentence()).closed.subscribe((confirmed) => {
			if (!confirmed) return;
			this._repository.store
				.deleteObject$(contributor.id)
				.pipe(switchMap(() => this.paginator.refresh()))
				.subscribe();
		});
	}


	public shareWithTeam(contributor: Contributor) {
		this._accessService.shareWithTeam(contributor.id, 'contributor');
	}

	public openSharingDetails(contributor: Contributor) {
		this._accessService.openSharingDetails(contributor.id, 'contributor');
	} 
}
