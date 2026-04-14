import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { TranslateDirective } from '@foundation/translations/services';
import { Project } from '@edf/edf-project-rands/models';
import { ProjectsRepository, CustomersRepository, ContributorsRepository } from '@edf/edf-project-rands/state';
import { CustomersModals, ContributorsModals } from '@edf/edf-project-rands/modals';
import { NotificationService } from '@foundation/notification';
import { PatchableItem } from '@foundation/utils';
import { combineLatest, of, switchMap, tap } from 'rxjs';
import { ProjectImportExportService } from '../project-import-export.service';

@Component({
	selector: 'lib-project-builder-menu',
	standalone: true,
	imports: [CommonModule, TranslateDirective],
	templateUrl: './project-builder-menu.component.html',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProjectBuilderMenuComponent {
	private _projectsRepository = inject(ProjectsRepository);
	private _customersRepository = inject(CustomersRepository);
	private _customersModals = inject(CustomersModals);
	private _contributorsRepository = inject(ContributorsRepository);
	private _contributorsModals = inject(ContributorsModals);
	private _projectImportExportService = inject(ProjectImportExportService);
	private _notificationService = inject(NotificationService);

	mainCustomerDisplayName = signal<string>('');
	sponsorCustomerDisplayName = signal<string>('');
	projectManagerDisplayName = signal<string>('');
	strategicLeadDisplayName = signal<string>('');
	isTransferringProject = signal<boolean>(false);
	public projectId = input<string | null>(null);
	patchableProject = new PatchableItem<Project>(
		this.projectId,
		(id) => (id ? this._projectsRepository.store.getObjectById$$$(id, true).$ : of(null)),
		(projectId, patch) => this._projectsRepository.store.applyPatch(projectId, patch)
	);
	// public project = this.patchableProject.patchedItem;

	constructor() {
		// contributors and customers
		this.patchableProject.item$$$
			.pipe(
				takeUntilDestroyed(),
				switchMap((project) => {
					const mainCustomer$ = project?.config.mainCustomerId ? this._customersRepository.store.getObjectByIdPullOnce$$$(project.config.mainCustomerId).$ : of(null);
					const sponsorCustomer$ = project?.config.sponsorCustomerId ? this._customersRepository.store.getObjectByIdPullOnce$$$(project.config.sponsorCustomerId).$ : of(null);
					const pmContributor$ = project?.config.projectManagerContributorId ? this._contributorsRepository.store.getObjectByIdPullOnce$$$(project.config.projectManagerContributorId).$ : of(null);
					const strategicContributor$ = project?.config.strategicLeadContributorId ? this._contributorsRepository.store.getObjectByIdPullOnce$$$(project.config.strategicLeadContributorId).$ : of(null);

					return combineLatest([mainCustomer$, sponsorCustomer$, pmContributor$, strategicContributor$]);
				}),
				tap(([mainCustomer, sponsorCustomer, pmContributor, strategicContributor]) => {
					this.mainCustomerDisplayName.set(mainCustomer ? `${mainCustomer.firstName ?? ''} ${mainCustomer.lastName ?? ''}`.trim() : '');
					this.sponsorCustomerDisplayName.set(sponsorCustomer ? `${sponsorCustomer.firstName ?? ''} ${sponsorCustomer.lastName ?? ''}`.trim() : '');
					this.projectManagerDisplayName.set(pmContributor ? `${pmContributor.firstName ?? ''} ${pmContributor.lastName ?? ''}`.trim() : '');
					this.strategicLeadDisplayName.set(strategicContributor ? `${strategicContributor.firstName ?? ''} ${strategicContributor.lastName ?? ''}`.trim() : '');
				})
			)
			.subscribe();
	}

	public formatDate(value?: string): string {
		if (!value) return '';
		// If value contains a time (ISO), return the date part
		if (value.includes('T')) return value.split('T')[0];
		// If it's already a YYYY-MM-DD or similar, return first 10 chars
		return value.length >= 10 ? value.slice(0, 10) : value;
	}

	public openSelectCustomer(kind: 'main' | 'sponsor') {
		const dialogRef = this._customersModals.openCustomerSelectDialog({
			selectionConstraints: {
				single: true,
				minCustomers: 1,
				maxCustomers: 1,
			},
			alreadySelectedCustomers: [],
		});
		dialogRef.closed.subscribe((result) => {
			if (!result || result.customers.length === 0) return;
			const firstCustomer = result.customers[0];
			if (kind === 'main') this.patchableProject.updateField('config.mainCustomerId', firstCustomer.id);
			if (kind === 'sponsor') this.patchableProject.updateField('config.sponsorCustomerId', firstCustomer.id);
		});
	}

	public clearCustomer(kind: 'main' | 'sponsor') {
		if (kind === 'main') this.patchableProject.updateField('config.mainCustomerId', undefined);
		if (kind === 'sponsor') this.patchableProject.updateField('config.sponsorCustomerId', undefined);
	}

	public openSelectContributor(kind: 'pm' | 'strategic') {
		const dialogRef = this._contributorsModals.openContributorSelectDialog({
			selectionConstraints: {
				single: true,
				minContributors: 1,
				maxContributors: 1,
			},
			alreadySelectedContributors: [],
		});
		dialogRef.closed.subscribe((result) => {
			if (!result || result.contributors.length === 0) return;
			const firstContributor = result.contributors[0];
			if (kind === 'pm') this.patchableProject.updateField('config.projectManagerContributorId', firstContributor.id);
			if (kind === 'strategic') this.patchableProject.updateField('config.strategicLeadContributorId', firstContributor.id);
		});
	}

	public clearContributor(kind: 'pm' | 'strategic') {
		if (kind === 'pm') this.patchableProject.updateField('config.projectManagerContributorId', undefined);
		if (kind === 'strategic') this.patchableProject.updateField('config.strategicLeadContributorId', undefined);
	}

	public async exportProject() {
		const project = this.patchableProject.patchedItem();
		if (!project) return;

		this.isTransferringProject.set(true);
		try {
			await this._projectImportExportService.exportProject(project.id);
			this._notificationService.snackSuccess('Project exported successfully.');
		} catch (error) {
			this._notificationService.error(`Project export failed: ${this._toErrorMessage(error)}`);
		} finally {
			this.isTransferringProject.set(false);
		}
	}

	public triggerImport(fileInput: HTMLInputElement) {
		if (this.isTransferringProject()) return;
		fileInput.click();
	}

	public async importProjectFromFile(event: Event) {
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;

		this.isTransferringProject.set(true);
		try {
			const content = await file.text();
			const payload = JSON.parse(content) as unknown;
			const result = await this._projectImportExportService.importProject(payload);
			this._notificationService.snackSuccess('Project imported successfully.');
			this._projectsRepository.goToProject(result.projectId);
		} catch (error) {
			this._notificationService.error(`Project import failed: ${this._toErrorMessage(error)}`);
		} finally {
			this.isTransferringProject.set(false);
			input.value = '';
		}
	}

	private _toErrorMessage(error: unknown) {
		if (error instanceof Error && error.message) return error.message;
		return 'Unexpected error';
	}
}
