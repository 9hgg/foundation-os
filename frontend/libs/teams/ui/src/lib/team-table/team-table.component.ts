/* eslint-disable @angular-eslint/prefer-inject */
import { CdkMenuModule } from '@angular/cdk/menu';
import { CommonModule } from '@angular/common';
import { Attribute, ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { FoldersModals } from '@foundation/folders/modals';
import { BehaviorType, RepositoryTableComponent } from '@foundation/table/ui';
import { Team } from '@foundation/teams/models';
import { TeamsRepository } from '@foundation/teams/state';
import { TranslateDirective, TranslatePipe } from '@foundation/translations/services';
import { DateAsAgoPipe } from '@foundation/utils';
import { switchMap } from 'rxjs';

@Component({
	selector: 'lib-team-table',
	standalone: true,
	imports: [
		//
		CommonModule,
		ReactiveFormsModule,
		FormsModule,
		CdkMenuModule,
		TranslateDirective,
		TranslatePipe,
		DateAsAgoPipe,
	],
	templateUrl: './team-table.component.html',
	styleUrl: './team-table.component.css',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TeamTableComponent extends RepositoryTableComponent<Team, TeamsRepository> {
	private _foldersModal = inject(FoldersModals);
	constructor(
		private _repository: TeamsRepository,
		@Attribute('click-behavior') clickBehavior: BehaviorType,
		@Attribute('include-anonymous') includeAnonymous: boolean | null
	) {
		super(
			_repository,
			{
				orderingBy: { fieldName: 'timeUpdated', direction: 'desc' },

				requestFn: (page, pageSize, filters, orderingBy, forceRequest) => {
					return _repository.store.getObjects$(page, pageSize, filters, orderingBy, forceRequest, includeAnonymous ? false : undefined);
				},
			},
			clickBehavior
		);
	}

	private _i18n_renameSentence = this._translationService.prep('Give it a new name:');
	public renameTeam(team: Team) {
		this._notificationService.prompt(this._i18n_renameSentence(), team.name ?? '').closed.subscribe((promptResult) => {
			if (!promptResult) return;
			const newName = promptResult.value;
			if (!newName) return;

			this._repository.store
				.putObject$({ ...team, name: newName })
				.pipe(switchMap(() => this.paginator.refresh()))
				.subscribe();
		});
	}

	private _i18n_deleteSentence = this._translationService.prep('Are you sure you want to delete this team?');
	private _i18n_deleteBtnSentence = this._translationService.prep('Delete');
	public deleteTeam(team: Team) {
		this._notificationService.confirm(this._i18n_deleteSentence(), team.name ?? '', { confirmButtonText: this._i18n_deleteBtnSentence() }).closed.subscribe((confirmed) => {
			if (!confirmed) return;
			this._repository.store
				.deleteObject$(team.id)
				.pipe(switchMap(() => this.paginator.refresh()))
				.subscribe();
		});
	}

	public goToTeam(teamId: string) {
		this._repository.goToTeam(teamId);
	}

	public openFolderSelectionModalFor(team: Team) {
		this._foldersModal.openFolderSelectionDialog().closed.subscribe((result) => {
			console.log('The folders selection dialog was closed with this result:', result);
			if (result && result.folders.length > 0) {
				const folder = result.folders[0];
				this._requestService.getBasic$('/api/folders/' + folder.id + '/add/team/' + team.id).subscribe();
			}
		});
	}
}
