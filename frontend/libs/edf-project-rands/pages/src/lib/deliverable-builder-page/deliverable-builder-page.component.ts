import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, effect, inject, model, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { CustomersModals } from '@edf/edf-project-rands/modals';
import { CustomerPillComponent } from '@edf/edf-project-rands/ui';
import { ActivityDeliverable, Customer, Deliverable, Project } from '@edf/edf-project-rands/models';
import { ActivitiesRepository, BatchesRepository, CustomersRepository, DeliverablesRepository, ProjectsRepository } from '@edf/edf-project-rands/state';
import { RequestService } from '@foundation/network/services';
import { NotificationService } from '@foundation/notification';
import { QuillTextareaComponent } from '@foundation/quill/ui';
import { TranslateDirective } from '@foundation/translations/services';
import { BehaviorSubjectReplayedProxied } from '@foundation/utils';
import { map, of, switchMap } from 'rxjs';

@Component({
	selector: 'lib-deliverable-builder-page',
	standalone: true,
	imports: [CommonModule, FormsModule, TranslateDirective, RouterModule, QuillTextareaComponent, CustomerPillComponent],
	templateUrl: './deliverable-builder-page.component.html',
	styleUrls: ['./deliverable-builder-page.component.css'],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DeliverableBuilderPageComponent {
	public notificationService = inject(NotificationService);
	private _deliverablesRepository = inject(DeliverablesRepository);
	private _activitiesRepository = inject(ActivitiesRepository);
	private _batchesRepository = inject(BatchesRepository);
	private _projectsRepository = inject(ProjectsRepository);
	private _customersRepository = inject(CustomersRepository);
	private _customersModals = inject(CustomersModals);
	private _requestService = inject(RequestService);

	public deliverableId = model<string | null>(null);
	public project = signal<Project | null>(null);
	public selectedCustomer = signal<Customer | null>(null);
	pdfUrl = signal<string | null>(null);

	deliverable$$$ = new BehaviorSubjectReplayedProxied<string | null, Deliverable | null>((id: string | null) => {
		return id ? this._deliverablesRepository.store.getObjectById$$$(id, true).$ : of(null);
	}, null);

	constructor() {
		const _route = inject(ActivatedRoute);
		_route.paramMap.subscribe((pm) => this.deliverableId.set(pm.get('deliverableId')));

		effect(() => {
			const id = this.deliverableId();
			this.deliverable$$$.next(id);
		});

		this.deliverable$$$.$.pipe(
			takeUntilDestroyed(),
			switchMap((deliverable) => {
				this.project.set(null);
				if (deliverable) {
					return this._requestService
						.getBasic$<{ data: ActivityDeliverable[] }>('/api/edf/rand/activity-deliverables', {
							filters: `deliverable_id:${deliverable.id}:exact`,
							page_size: 1,
						})
						.pipe(
							map((response) => response?.result?.data?.[0]),
							switchMap((ad) => {
								if (!ad) return of(null);
								return this._activitiesRepository.store.getObjectById$$$(ad.activityId, true).$;
							}),
							switchMap((activity) => {
								if (!activity) return of(null);
								return this._batchesRepository.store.getObjectById$$$(activity.batchId, true).$;
							}),
							switchMap((batch) => {
								if (!batch || !batch.projectId) return of(null);
								return this._projectsRepository.store.getObjectById$$$(batch.projectId, true).$;
							})
						);
				}
				return of(null);
			})
		).subscribe((p) => this.project.set(p));

		this.deliverable$$$.$
			.pipe(
				takeUntilDestroyed(),
				switchMap((deliverable) => {
					if (!deliverable?.customerId) return of(null);
					return this._customersRepository.store.getObjectByIdPullOnce$$$(deliverable.customerId).$;
				})
			)
			.subscribe((customer) => this.selectedCustomer.set(customer));
	}

	updateTitle(title: string) {
		const d = this.deliverable$$$.value;
		if (!d) return;
		d.title = title;
		this._deliverablesRepository.store.save(d);
	}

	updateDates(start: string, end: string) {
		const d = this.deliverable$$$.value;
		if (!d) return;
		d.startDate = start || undefined;
		d.endDate = end || undefined;
		this._deliverablesRepository.store.save(d);
	}

	updateDescription(description: string) {
		const d = this.deliverable$$$.value;
		if (!d) return;
		d.description = description;
		this._deliverablesRepository.store.save(d);
	}

	updateIsPrincipal(isPrincipal: boolean) {
		const d = this.deliverable$$$.value;
		if (!d) return;
		d.isPrincipal = isPrincipal;
		this._deliverablesRepository.store.save(d);
	}

	updateHidden(hidden: boolean) {
		const d = this.deliverable$$$.value;
		if (!d) return;
		d.hidden = hidden;
		this._deliverablesRepository.store.save(d);
	}

	selectCustomer() {
		const alreadySelected = this.selectedCustomer();
		const dialogRef = this._customersModals.openCustomerSelectDialog({
			selectionConstraints: {
				single: true,
				maxCustomers: 1,
				minCustomers: 1,
			},
			alreadySelectedCustomers: alreadySelected ? [alreadySelected] : [],
		});
		dialogRef.closed.subscribe((result) => {
			const customer = result?.customers?.[0] ?? null;
			const d = this.deliverable$$$.value;
			if (!d) return;
			this.selectedCustomer.set(customer);
			d.customerId = customer?.id || undefined;
			this._deliverablesRepository.store.save(d);
		});
	}

	clearCustomer() {
		const d = this.deliverable$$$.value;
		if (!d) return;
		this.selectedCustomer.set(null);
		d.customerId = undefined;
		this._deliverablesRepository.store.save(d);
	}
}
