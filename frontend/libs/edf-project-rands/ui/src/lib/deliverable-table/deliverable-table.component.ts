/* eslint-disable @angular-eslint/prefer-inject */
import { Deliverable } from '@edf/edf-project-rands/models';
import { DeliverablesRepository } from '@edf/edf-project-rands/state';
import { BehaviorType, RepositoryTableComponent } from '@foundation/table/ui';
import { TranslateDirective, TranslatePipe } from '@foundation/translations/services';
import { CdkMenu, CdkMenuItem, CdkMenuModule } from '@angular/cdk/menu';
import { CommonModule } from '@angular/common';
import { Attribute, ChangeDetectionStrategy, Component, EventEmitter, inject, input, Output } from '@angular/core';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { switchMap } from 'rxjs';
import { AccessService } from '@foundation/shared/access';

@Component({
	selector: 'lib-deliverable-table',
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
	templateUrl: './deliverable-table.component.html',
	styleUrl: './deliverable-table.component.css',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DeliverableTableComponent extends RepositoryTableComponent<Deliverable, DeliverablesRepository> {
	actionMode = input<'default' | 'detach' | 'none'>('default');
	@Output() detachRequested = new EventEmitter<Deliverable>();
	constructor(
		private _repository: DeliverablesRepository,
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

	private _i18n_deleteSentence = this._translationService.prep('Are you sure you want to delete this deliverable?');
	private _accessService = inject(AccessService);
	public deleteDeliverable(deliverable: Deliverable) {
		this._notificationService.confirm(this._i18n_deleteSentence()).closed.subscribe((confirmed) => {
			if (!confirmed) return;
			this._repository.store
				.deleteObject$(deliverable.id)
				.pipe(switchMap(() => this.paginator.refresh()))
				.subscribe();
		});
	}

	public shareWithTeam(deliverable: Deliverable) {
		this._accessService.shareWithTeam(deliverable.id, 'deliverable');
	}

	public openSharingDetails(deliverable: Deliverable) {
		this._accessService.openSharingDetails(deliverable.id, 'deliverable');
	} 

	public requestDetach(deliverable: Deliverable) {
		this.detachRequested.emit(deliverable);
	}
}
