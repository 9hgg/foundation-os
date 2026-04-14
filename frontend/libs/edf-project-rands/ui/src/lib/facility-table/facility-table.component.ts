/* eslint-disable @angular-eslint/prefer-inject */
import { Facility } from '@edf/edf-project-rands/models';
import { FacilitiesRepository } from '@edf/edf-project-rands/state';
import { BehaviorType, RepositoryTableComponent } from '@foundation/table/ui';
import { TranslateDirective, TranslatePipe } from '@foundation/translations/services';
import { CdkMenu, CdkMenuItem, CdkMenuModule } from '@angular/cdk/menu';
import { CommonModule } from '@angular/common';
import { Attribute, ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { switchMap } from 'rxjs';
import { AccessService } from '@foundation/shared/access';

@Component({
	selector: 'lib-facility-table',
	standalone: true,
	imports: [
		//
		CommonModule,
		TranslateDirective,
		TranslatePipe,
		ReactiveFormsModule,
		FormsModule,
		CdkMenuModule,
		CdkMenu,
		CdkMenuItem,
	],
	templateUrl: './facility-table.component.html',
	styleUrl: './facility-table.component.css',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FacilityTableComponent extends RepositoryTableComponent<Facility, FacilitiesRepository> {
	constructor(
		private _repository: FacilitiesRepository,
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

	private _i18n_deleteSentence = this._translationService.prep('Are you sure you want to delete this facility?');
	private _accessService = inject(AccessService);
	public deleteFacility(facility: Facility) {
		this._notificationService.confirm(this._i18n_deleteSentence()).closed.subscribe((confirmed) => {
			if (!confirmed) return;
			this._repository.store
				.deleteObject$(facility.id)
				.pipe(switchMap(() => this.paginator.refresh()))
				.subscribe();
		});
	}

	public shareWithTeam(facility: Facility) {
		this._accessService.shareWithTeam(facility.id, 'facility');
	}

	public openSharingDetails(facility: Facility) {
		this._accessService.openSharingDetails(facility.id, 'facility');
	} 
}
