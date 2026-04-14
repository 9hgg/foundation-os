import { ChangeDetectionStrategy, Component, inject } from '@angular/core';

import { toSignal } from '@angular/core/rxjs-interop';
import { ContributorsModals } from '@edf/edf-project-rands/modals';
import { Contributor } from '@edf/edf-project-rands/models';
import { ContributorsRepository } from '@edf/edf-project-rands/state';
import { ContributorTableComponent } from '@edf/edf-project-rands/ui';
import { FileModals } from '@foundation/files/modals';
import { NotificationService } from '@foundation/notification';
import { AccessService } from '@foundation/shared/access';
import { TranslateDirective } from '@foundation/translations/services';
import { of, switchMap, tap } from 'rxjs';
import { v4 as uuidv4 } from 'uuid';

@Component({
	selector: 'lib-contributor-list-page',
	standalone: true,
	imports: [TranslateDirective, ContributorTableComponent],
	templateUrl: './contributor-list-page.component.html',
	styleUrl: './contributor-list-page.component.css',
	changeDetection: ChangeDetectionStrategy.OnPush,
	host: {
		class: 'dashboard-page-host',
	},
})
export class ContributorListPageComponent {
	contributorsRepository = inject(ContributorsRepository);

	private _contributorsModals = inject(ContributorsModals);
	private _fileModals = inject(FileModals);
	private _notificationService = inject(NotificationService);
	private _accessService = inject(AccessService);

	isAdmin = toSignal(this._accessService.checkAdmin$(), { initialValue: false });

	public createNew() {
		return this._contributorsModals
			.openContributorCreateDialog()
			.closed.pipe(
				switchMap((result) => {
					if (!result) return of(null);
					const id = uuidv4();

					const payload: Contributor = {
						id: id,
						firstName: result.firstName,
						lastName: result.lastName,
						email: result.email,
						category: result.category,
						unit: result.unit,
						department: result.department,
						group: result.group,
					};

					return this.contributorsRepository.store.postObject$(payload);
				}),
				tap((r) => {
					const newId = r?.result?.data?.id;
					if (newId) this.contributorsRepository.goToContributor(newId);
				})
			)
			.subscribe();
	}

	public importFromExcel() {
		this._fileModals
			.openFilesSelectionDialog({
				selectionConstraints: { single: true, maxFiles: 1, minFiles: 1 },
			})
			.closed.pipe(
				switchMap((result) => {
					if (!result?.files?.length) return of(null);
					const file = result.files[0];
					return this.contributorsRepository.previewFromFile$(file.id).pipe(
						// nested pipe to keep file object
						switchMap((previewRes) => {
							if (!previewRes?.result) {
								this._notificationService.error(previewRes?.error?.title || 'Preview failed');
								return of(null);
							}
							// open preview modal
							const dialogRef = this._contributorsModals.openImportPreviewDialog(previewRes.result);
							return dialogRef.closed.pipe(
								switchMap((previewResult) => {
									if (!previewResult?.selectedNames?.length) return of(null);
									return this.contributorsRepository.importFromFile$(file.id, previewResult.selectedNames);
								})
							);
						})
					);
				})
			)
			.subscribe((res) => {
				if (!res) return;
				if (res?.result) {
					const { inserted, updated, skipped } = res.result;
					this._notificationService.notify(`Imported contributors: ${inserted} inserted, ${updated} updated, ${skipped} skipped`, 'Import completed');
				} else if (res?.error) {
					this._notificationService.error(res.error.title + (res.error.description ? ': ' + res.error.description : ''));
				}
			});
	}

	public purgeAll() {
		// Double confirmation flow using the dialog's .closed observable
		const first = this._notificationService.confirm('Purge all contributors?', 'This will delete all contributors and their ACLs. This action cannot be undone.', { confirmButtonText: 'Purge', cancelButtonText: 'Cancel' });
		first.closed.subscribe((confirmed: boolean | undefined) => {
			if (!confirmed) return;
			const second = this._notificationService.confirm('Are you sure you want to purge all contributors?', 'Please confirm this irreversible action.', { confirmButtonText: 'Yes, purge', cancelButtonText: 'Cancel' });
			second.closed.subscribe((confirmed2: boolean | undefined) => {
				if (!confirmed2) return;
				this.contributorsRepository.purgeAll$().subscribe(
					(res) => {
						if (res?.result) {
							const { deleted_contributors, deleted_acls } = res.result;
							this._notificationService.notify(`Purge completed: deleted ${deleted_contributors} contributors and ${deleted_acls} ACLs`, 'Purge completed');
						} else if (res?.error) {
							this._notificationService.error(res.error.title + (res.error.description ? ': ' + res.error.description : ''));
						}
					},
					(err) => {
						this._notificationService.error('Purge failed');
					}
				);
			});
		});
	}
}
