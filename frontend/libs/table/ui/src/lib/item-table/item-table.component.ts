import { PaginatorStateOptions, RequestFn } from '@foundation/network/store';
import { GenericRepository } from '@foundation/table/state';
import { TranslateDirective, TranslatePipe } from '@foundation/translations/services';
import { FullSpanRowDirective } from '@foundation/utils';
import { CdkMenu, CdkMenuItem, CdkMenuModule } from '@angular/cdk/menu';
import { CommonModule } from '@angular/common';
import { Attribute, ChangeDetectionStrategy, Component, Inject, OnDestroy } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { cloneDeep } from 'lodash-es';
import { combineLatest, of, switchMap, tap } from 'rxjs';
import { BehaviorType, GenericItemTableComponent, PAGINATOR_OPTIONS } from '../generic-item-table/generic-item-table.component';

export const ITEM_REPOSITORY = 'ITEM_REPOSITORY';

@Component({
	selector: 'lib-item-table',
	standalone: true,
	imports: [
		//
		CommonModule,
		TranslateDirective,
		TranslatePipe,
		FullSpanRowDirective,
		ReactiveFormsModule,
		FormsModule,
		CdkMenuModule,
		CdkMenu,
		CdkMenuItem,
	],
	templateUrl: './item-table.component.html',
	styleUrl: './item-table.component.css',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RepositoryTableComponent<Item extends { id: string }, ItemRepository extends GenericRepository<Item>> extends GenericItemTableComponent<Item> implements OnDestroy {
	/**
	 * @param _itemsRepository the repository to use to get the items
	 */
	constructor(
		@Inject(ITEM_REPOSITORY) protected _itemsRepository: ItemRepository,
		@Inject(PAGINATOR_OPTIONS) protected repositoryTablePaginatorOptions?: Partial<PaginatorStateOptions<Item>>,
		@Attribute('click-behavior') clickBehavior?: BehaviorType,
		@Attribute('item-kind') itemKind?: string
	) {
		const options: PaginatorStateOptions<Item> & { requestFn: RequestFn<Item> } = {
			requestFn: (page, pageSize, filters, orderingBy, forceRequest) => {
				return _itemsRepository.store.getObjects$(page, pageSize, filters, orderingBy, forceRequest);
			},
			...repositoryTablePaginatorOptions,
		};
		if (!clickBehavior) {
			console.warn(`clickBehavior is not set for ${itemKind}, defaulting to "select". Please set it to "select", "expand", "emit", "toggle", "none" or "customFn"`);
		}
		super(options, clickBehavior, itemKind);

		// ensure that objects from current page are updated
		this.paginator.itemsOnCurrentPage$$$
			.pipe(
				takeUntilDestroyed(),
				switchMap((items) => {
					return combineLatest(items.map((item) => (item ? this._itemsRepository.store.getObjectById$$$(item.id).$ : of(null))));
				}),
				tap((items) => {
					// add results to cache
					const mapIdsToItems = cloneDeep(this.paginator.mapIdsToItems$$$.value);
					for (const item of items) {
						if (item) mapIdsToItems.set(item.id, item);
					}
					this.paginator.mapIdsToItems$$$.next(mapIdsToItems);
				})
			)
			.subscribe();
	}
}
