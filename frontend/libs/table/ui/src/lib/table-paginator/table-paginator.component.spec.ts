import { TestBed } from '@angular/core/testing';
import { BehaviorSubject } from 'rxjs';
import { TablePaginatorComponent } from './table-paginator.component';

describe('TablePaginatorComponent', () => {
	const buildFixture = (numberOfItemsPerPage: number) => {
		const state$ = new BehaviorSubject({ numberOfItemsPerPage, totalNumberOfItems: 9, totalNumberOfPages: 2, currentPage: 1 });
		TestBed.configureTestingModule({});
		TestBed.overrideComponent(TablePaginatorComponent, { set: { template: '', imports: [] } });
		const fixture = TestBed.createComponent(TablePaginatorComponent);
		fixture.componentRef.setInput('paginator', { state$ } as never);
		fixture.detectChanges();
		return fixture;
	};

	afterEach(() => TestBed.resetTestingModule());

	it('offers the usual choices when the page size is one of them', () => {
		const fixture = buildFixture(25);

		expect(fixture.componentInstance['sizeChoices']()).toEqual([10, 25, 50, 100]);
	});

	// A select whose value matches no option displays its first one, so a table paging by five
	// showed a footer reading ten.
	it('adds the current page size when a table chose its own', () => {
		const fixture = buildFixture(5);

		expect(fixture.componentInstance['sizeChoices']()).toEqual([5, 10, 25, 50, 100]);
	});
});
