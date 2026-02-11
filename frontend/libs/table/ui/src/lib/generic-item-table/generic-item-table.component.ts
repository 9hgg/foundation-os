import { CdkMenu, CdkMenuItem, CdkMenuModule } from '@angular/cdk/menu';
import { CommonModule } from '@angular/common';
import { Attribute, ChangeDetectionStrategy, Component, effect, ElementRef, EventEmitter, Inject, inject, input, model, Output, signal, viewChildren } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { RequestService } from '@foundation/network/services';
import { convertFilterToQueryString, convertQueryStringToFilter, createLocalRequestFn, Filter, PaginatorState, PaginatorStateOptions, RequestFn } from '@foundation/network/store';
import { NotificationService } from '@foundation/notification';
import { TranslateDirective, TranslatePipe, TranslationService } from '@foundation/translations/services';
import { createBehaviorSubjectProxy, DragAndDropService, FullSpanRowDirective, Selector } from '@foundation/utils';
import { combineLatest, debounceTime, of, tap } from 'rxjs';
export const PAGINATOR_OPTIONS = 'PAGINATOR_OPTIONS';
export type BehaviorType = 'select' | 'expand' | 'emit' | 'toggle' | 'none' | 'customFn';

@Component({
	selector: 'lib-generic-item-table',
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
	templateUrl: './generic-item-table.component.html',
	styleUrl: './generic-item-table.component.css',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GenericItemTableComponent<Item extends { id: string }> {
	protected _router = inject(Router);
	private _route = inject(ActivatedRoute);
	protected _translationService = inject(TranslationService);
	protected _notificationService = inject(NotificationService);
	protected _requestService = inject(RequestService);

	numSelected = signal(0);
	draggableRows = viewChildren<ElementRef<HTMLTableRowElement>>('draggableRow');
	private rowDragListeners: (() => void)[] = [];
	protected _dragAndDropService = inject(DragAndDropService);

	clickBehavior: BehaviorType = 'select';
	itemKind?: string;

	@Output() columnClicked = new EventEmitter<string>();
	@Output() cellClicked = new EventEmitter<{ column: string; item: Item; message?: any }>();
	@Output() rowClicked = new EventEmitter<Item>();
	@Output() selectedItemsChange = new EventEmitter<Item[]>();

	@Output() dragStarted = new EventEmitter<Item[]>();
	@Output() dragEnded = new EventEmitter<{
		items: Item[];
		coordinates: {
			x: number;
			y: number;
		};
	}>();
	@Output() dragMoved = new EventEmitter<{
		items: Item[];
		coordinates: {
			x: number;
			y: number;
		};
	}>();

	// items
	/** explicitItems is used when the list is already known */
	explicitItems = model<(Item | null)[] | null>(null);
	paginator: PaginatorState<Item>;
	itemsSelector: Selector<Item> = new Selector<Item>((a, b) => a.id === b.id, []);
	hiddenColumns: Selector<string> = new Selector<string>((a, b) => a === b, []);
	/** To use to pre-select items by ids */
	preSelectedItems = input<Item[]>([]);

	openedItems: Selector<Item> = new Selector<Item>((a, b) => a.id === b.id, []);

	/** for each column, do we display the search input */
	displaySearchByFields$_ = createBehaviorSubjectProxy({} as Record<string, boolean>);
	filterByFields$_ = createBehaviorSubjectProxy({} as Record<string, string | number | boolean>);

	/** this is used to get/set the search pattern from/to the URL */
	searchPatternInUrl = model<string | null>();
	queryForSearchPatternInUrl = input<string | null>(null);

	requestFn: RequestFn<Item>;

	constructor(
		@Inject(PAGINATOR_OPTIONS) protected paginatorOptions?: Partial<PaginatorStateOptions<Item>>,
		@Attribute('click-behavior') clickBehavior: 'select' | 'expand' | 'emit' | 'toggle' | 'none' | 'customFn' | null = null,
		@Attribute('item-kind') itemKind?: string
	) {
		if (clickBehavior) {
			this.clickBehavior = clickBehavior;
		} else {
			console.warn('clickBehavior is not set, defaulting to "select". Please set it to "select", "expand", "emit", "toggle", "none" or "customFn"');
			this.clickBehavior = 'select';
		}
		this.itemKind = itemKind;
		const options: PaginatorStateOptions<Item> & { requestFn: RequestFn<Item> } = {
			requestFn: (page, pageSize, filters, orderingBy, forceRequest) => {
				return of({
					data: [],
					self: '<>',
					all: '',
					next: '',
					hasNext: false,
					prev: '',
					hasPrev: false,
					totalCount: 0,
					page: 1,
				});
			},
			...paginatorOptions,
		};

		this.paginator = new PaginatorState<Item>(options);
		this.requestFn = options.requestFn;

		// if explicitItems is set, use it to build a custom request fn
		effect(() => {
			const explicitItems = this.explicitItems();
			if (explicitItems) {
				console.log('Using explicit items', explicitItems);

				this.paginator.setRequestFn(createLocalRequestFn<Item>(explicitItems));
			} else {
				if (this.paginator.__requestFn$ != options.requestFn) {
					this.paginator.setRequestFn((page, pageSize, filters, orderingBy, forceRequest) => {
						return options.requestFn(page, pageSize, filters, orderingBy, forceRequest);
					});
				}
			}
		});

		// react to preSelectedItems
		effect(() => {
			const preSelectedItems = this.preSelectedItems();
			if (preSelectedItems) {
				this.itemsSelector.selectMultiple(preSelectedItems);
			}
		});

		// react to filter changes
		this.filterByFields$_.$.pipe(
			takeUntilDestroyed(),
			debounceTime(300),
			tap((controls) => {
				const newFilters: Filter[] = Object.entries(controls)
					.filter(([, value]) => value !== null && value !== undefined && value !== '')
					.map(([fieldName, value]) => {
						const normalizedValue = typeof value === 'string' && value.trim() !== '' && !Number.isNaN(Number(value)) ? Number(value) : value;
						return {
							fieldName,
							value: normalizedValue,
							matchType: typeof normalizedValue === 'boolean' || typeof normalizedValue === 'number' ? 'exact' : 'partial',
						};
					});
				console.log('Applying new filters to paginator', newFilters);
				this.paginator.setFilters(newFilters);

				const filtersAsString: string[] = newFilters.map((filter) => convertFilterToQueryString(filter));

				const queryForSearchPatternInUrl = this.queryForSearchPatternInUrl();
				if (queryForSearchPatternInUrl)
					// encode for uri and put it in the URL
					this._router.navigate([], {
						queryParams: { [queryForSearchPatternInUrl]: filtersAsString.join('$') },
						queryParamsHandling: 'merge',
						preserveFragment: true,
					});
			})
		).subscribe();

		// subscribe to url query params
		combineLatest([toObservable(this.queryForSearchPatternInUrl), this._route.queryParams])
			.pipe(
				takeUntilDestroyed(),
				tap(([queryForSearchPatternInUrl, queryParams]) => {
					if (!queryForSearchPatternInUrl) return;

					const searchPatternInUrl: string | undefined = queryParams[queryForSearchPatternInUrl];
					const searchPattern =
						searchPatternInUrl?.split('$').reduce(
							(acc, curr) => {
								const filter = convertQueryStringToFilter(curr);
								if (filter) {
									acc[filter.fieldName] = filter.value;
								}
								return acc;
							},
							{} as Record<string, string>
						) ?? {};

					// for all set key we have to display the search input (displaySearchByFields$_)
					Object.entries(searchPattern).forEach(([key, value]) => {
						this.displaySearchByFields$_[key] = true;
					});

					Object.assign(this.filterByFields$_, searchPattern);
				})
			)
			.subscribe();

		if (this.itemKind)
			// Set up effect to watch for changes in table rows
			effect(() => {
				const rows = this.draggableRows();
				this._cleanupRowDragListeners();
				this._setupRowDragListeners(rows);
			});

		this.itemsSelector.selectedItems$
			.pipe(
				takeUntilDestroyed(),
				tap((items) => {
					this.numSelected.set(items.length);
				})
			)
			.subscribe();
	}

	processClick(item: Item) {
		switch (this.clickBehavior) {
			case 'select':
				this.itemsSelector.toggle(item);
				break;
			case 'emit':
				this.rowClicked.emit(item);
				break;
			case 'toggle':
				this.openedItems.toggle(item);
				break;
			case 'none':
				break;
			case 'expand':
				this.openedItems.toggle(item);
				break;
			case 'customFn':
				this.customFunction(item);
				break;
			default:
				throw new Error(`Unknown clickBehavior: ${this.clickBehavior}`);
		}
	}

	customFunction(item: Item) {
		// This function should be overridden by the user of the component
		console.warn('customFunction not implemented', item);
	}

	toggleSearchByField(field: string) {
		this.displaySearchByFields$_[field] = !this.displaySearchByFields$_[field];
		this.filterByFields$_[field] = '';
	}

	ngOnDestroy(): void {
		this._cleanupRowDragListeners();
	}

	//////////
	//////////
	////////// ROW DRAGGING SETUP
	//////////
	//////////

	private _setupRowDragListeners(rows: readonly ElementRef<HTMLTableRowElement>[]): void {
		rows.forEach((rowRef: ElementRef<HTMLTableRowElement>, index: number) => {
			const row = rowRef.nativeElement;
			row.draggable = true;

			const dragStartHandler = (event: DragEvent) => {
				this._onRowDragStart(event, index);
			};

			const dragEndHandler = (event: DragEvent) => {
				this._onRowDragEnd(event, index);
			};

			const touchStartHandler = (event: TouchEvent) => {
				// Prevent default to avoid scrolling
				this._onRowDragTouchMove(event);
			};

			const dragMoveHandler = (event: TouchEvent | DragEvent) => {
				if (event instanceof TouchEvent) {
					this._onRowDragTouchMove(event);
				} else {
					// Handle drag move for mouse events

					const dom_pos_x = event.clientX;
					const dom_pos_y = event.clientY;
					this.dragMoved.emit({
						items: this.itemsSelector.selectedItems,
						coordinates: {
							x: dom_pos_x,
							y: dom_pos_y,
						},
					});
				}
			};

			row.addEventListener('dragstart', dragStartHandler);
			row.addEventListener('drag', dragMoveHandler);
			row.addEventListener('dragend', dragEndHandler);
			row.addEventListener('touchstart', touchStartHandler);

			// Store the cleanup functions
			this.rowDragListeners.push(() => {
				row.removeEventListener('dragstart', dragStartHandler);
				row.removeEventListener('drag', dragMoveHandler);
				row.removeEventListener('dragend', dragEndHandler);
				row.removeEventListener('touchstart', touchStartHandler);
			});
		});
	}

	private _cleanupRowDragListeners(): void {
		this.rowDragListeners.forEach((cleanup) => cleanup());
		this.rowDragListeners = [];
	}

	private _onRowDragStart(event: DragEvent, rowIndex: number): void {
		const currentItem = this.paginator.itemsOnCurrentPage$$$.value[rowIndex];
		if (this.itemsSelector.numSelected == 0 && currentItem) {
			// select if none was selected
			this.itemsSelector.select(currentItem);
		} else if (this.itemsSelector.numSelected == 1 && currentItem) {
			// if only one other was selected, we replace it
			this.itemsSelector.unselectAll();
			this.itemsSelector.select(currentItem);
		}
		console.log('Drag started on row:', rowIndex, this.itemsSelector.selectedItems);
		this._dragAndDropService.data = this.itemsSelector.selectedItems;
		this.dragStarted.emit(this.itemsSelector.selectedItems);

		// Create custom drag image showing count
		this._createRowDragCountImage(event, this.itemsSelector.selectedItems.length);

		// Add visual feedback during drag
		const target = event.currentTarget as HTMLTableRowElement;
		target?.classList.add('dragging');
	}

	/** The last touch move event when dragging with touch */
	private _lastRowTouchMoveEvent: TouchEvent | null = null;

	private _onRowDragTouchMove(event: TouchEvent): void {
		this._lastRowTouchMoveEvent = event;
	}

	private _onRowDragEnd(event: DragEvent | TouchEvent, rowIndex: number): void {
		// Remove visual feedback
		const target = event.currentTarget as HTMLTableRowElement;
		target?.classList.remove('dragging');

		let dom_pos_x = 0;
		let dom_pos_y = 0;
		if (event instanceof DragEvent) {
			dom_pos_x = event.clientX;
			dom_pos_y = event.clientY;
		} else if (event instanceof TouchEvent) {
			if (!this._lastRowTouchMoveEvent) {
				this._dragAndDropService.clear();
				return;
			}
			dom_pos_x = this._lastRowTouchMoveEvent.touches[0].clientX;
			dom_pos_y = this._lastRowTouchMoveEvent.touches[0].clientY;
		}

		this.dragEnded.emit({
			items: this.itemsSelector.selectedItems,
			coordinates: {
				x: dom_pos_x,
				y: dom_pos_y,
			},
		});

		// Clear the drag data
		this._dragAndDropService.data = null;
	}

	private _createRowDragCountImage(event: DragEvent, itemCount: number): void {
		// Create a div to show the number of items being dragged
		const dragCountDiv = document.createElement('div');
		dragCountDiv.style.cssText = `
			position: absolute;
			top: -1000px;
			left: -1000px;
			background: #2563eb;
			color: white;
			padding: 8px 12px;
			border-radius: 5px;
			font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
			font-size: 14px;
			font-weight: 600;
			box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
			border: 2px solid white;
			min-width: 40px;
			text-align: center;
			z-index: 1000;
		`;

		dragCountDiv.textContent = `${itemCount}`;

		// Add to body temporarily
		document.body.appendChild(dragCountDiv);

		// Set as drag image
		if (event.dataTransfer) {
			event.dataTransfer.setDragImage(dragCountDiv, 25, 15);

			// Set drag data
			event.dataTransfer.effectAllowed = 'move';
			event.dataTransfer.setData('text/plain', itemCount.toString());
			event.dataTransfer.setData(
				'application/json',
				JSON.stringify({
					count: itemCount,
					type: this.itemKind || 'items',
				})
			);
		}

		// Clean up the temporary div after a short delay
		setTimeout(() => {
			if (document.body.contains(dragCountDiv)) {
				document.body.removeChild(dragCountDiv);
			}
		}, 0);
	}
}
