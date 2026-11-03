import { AsyncPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { PaginatorState } from '@foundation/network/store';
import { TranslatePipe } from '@foundation/translations/services';
import { switchMap } from 'rxjs';

/**
 * The footer under a paginated table.
 *
 * Every table used to carry its own copy of this markup — 57 of them, in two dialects that had
 * drifted apart. It takes the live paginator itself, so a consumer only ever writes
 * `[paginator]="paginator"` — page back, page forward, where you are, how many there are in
 * total, and how many rows to a page (set `hidePageSizeOption` on a table that cannot support
 * changing it) all follow from that one object.
 *
 * It is `shrink-0` because it belongs at the bottom of a flex column whose rows scroll — see the
 * pagination-footer section in the frontend instructions.
 */
@Component({
	selector: 'lib-table-paginator',
	standalone: true,
	imports: [AsyncPipe, TranslatePipe],
	changeDetection: ChangeDetectionStrategy.OnPush,
	templateUrl: './table-paginator.component.html',
})
export class TablePaginatorComponent {
	paginator = input.required<PaginatorState<any>>();

	/** Strip the footer down to the row of buttons, for panes that cannot spare the height. */
	denseDisplay = input<boolean>(false);

	/** Choices offered in the page-size selector, shown by default on every table. */
	pageSizeOptions = input<number[]>([10, 25, 50, 100]);

	/** Escape hatch for a table that genuinely cannot support changing its page size. */
	hidePageSizeOption = input<boolean>(false);

	protected state = toSignal(toObservable(this.paginator).pipe(switchMap((paginator) => paginator.state$)));

	/** A table free to choose its own page size -- notifications page by five -- would otherwise
	 * set a value the selector has no option for, and a select with no matching option displays
	 * its first one: a footer reading 10 over a page of 5. */
	protected sizeChoices = computed(() => {
		const current = this.state()?.numberOfItemsPerPage;
		const options = this.pageSizeOptions();
		return current && !options.includes(current) ? [...options, current].sort((a, b) => a - b) : options;
	});
}
