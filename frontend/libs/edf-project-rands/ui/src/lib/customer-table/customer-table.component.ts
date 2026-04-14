/* eslint-disable @angular-eslint/prefer-inject */
import { CdkMenu, CdkMenuItem, CdkMenuModule } from '@angular/cdk/menu';
import { CommonModule } from '@angular/common';
import { Attribute, ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { Customer } from '@edf/edf-project-rands/models';
import { CustomersRepository } from '@edf/edf-project-rands/state';
import { AccessService } from '@foundation/shared/access';
import { BehaviorType, RepositoryTableComponent } from '@foundation/table/ui';
import { TranslateDirective, TranslatePipe } from '@foundation/translations/services';
import { switchMap } from 'rxjs';

@Component({
	selector: 'lib-customer-table',
	standalone: true,
	imports: [CommonModule, TranslateDirective, TranslatePipe, ReactiveFormsModule, FormsModule, CdkMenuModule, CdkMenu, CdkMenuItem],
	templateUrl: './customer-table.component.html',
	styleUrl: './customer-table.component.css',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CustomerTableComponent extends RepositoryTableComponent<Customer, CustomersRepository> {
	constructor(
		private _repository: CustomersRepository,
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

	private _i18n_deleteSentence = this._translationService.prep('Are you sure you want to delete this customer?');

	public deleteCustomer(customer: Customer) {
		this._notificationService.confirm(this._i18n_deleteSentence()).closed.subscribe((confirmed) => {
			if (!confirmed) return;
			this._repository.store
				.deleteObject$(customer.id)
				.pipe(switchMap(() => this.paginator.refresh()))
				.subscribe();
		});
	}

	private _accessService = inject(AccessService);
	public shareWithTeam(customer: Customer) {
		this._accessService.shareWithTeam(customer.id, 'customer');
	}
	public openSharingDetails(customer: Customer) {
		this._accessService.openSharingDetails(customer.id, 'customer');
	}
}
