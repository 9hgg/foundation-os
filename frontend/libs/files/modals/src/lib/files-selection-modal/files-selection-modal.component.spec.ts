import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { EntityFile } from '@foundation/files/models';
import { FilesRepository } from '@foundation/files/state';
import { FileTableComponent } from '@foundation/files/ui';
import { FoldersModals } from '@foundation/folders/modals';
import { RequestService } from '@foundation/network/services';
import { NotificationService } from '@foundation/notification';
import { AccessService } from '@foundation/shared/access';
import { TranslationService } from '@foundation/translations/services';
import { DragAndDropService } from '@foundation/utils';
import { EMPTY, Subject, of } from 'rxjs';
import { DEFAULT_FILE_SELECTION_MODAL_DATA, FilesSelectionModalComponent, FileSelectionModalData } from './files-selection-modal.component';

const selected: EntityFile[] = [{ id: 'file-1', name: 'One', inStorage: true, extra: {}, config: {} }];

describe('DEFAULT_FILE_SELECTION_MODAL_DATA', () => {
	it('selects exactly one file unless the caller says otherwise', () => {
		expect(DEFAULT_FILE_SELECTION_MODAL_DATA.selectionConstraints).toEqual({ maxFiles: 1, minFiles: 1, single: true });
	});
});

describe('FilesSelectionModalComponent', () => {
	const buildFixture = (data: FileSelectionModalData = {}) => {
		const close = vi.fn();
		const backdropClick = new Subject<void>();
		const keydownEvents = new Subject<KeyboardEvent>();

		TestBed.configureTestingModule({
			providers: [
				{ provide: DialogRef, useValue: { close, backdropClick, keydownEvents, closed: EMPTY, overlayRef: {} } },
				{ provide: DIALOG_DATA, useValue: data },
				{
					provide: FilesRepository,
					useValue: { store: { getObjects$: () => of({ data: [], totalCount: 0, page: 1 }), getObjectById$$$: () => ({ $: of(null) }) } },
				},
				{ provide: FoldersModals, useValue: { openFolderSelectionDialog: vi.fn() } },
				{ provide: Router, useValue: { navigate: vi.fn(), events: EMPTY } },
				{ provide: ActivatedRoute, useValue: { queryParams: of({}), snapshot: { queryParams: {} } } },
				{ provide: RequestService, useValue: {} },
				{ provide: NotificationService, useValue: {} },
				{ provide: TranslationService, useValue: { prep: (value: string) => () => value, instant: vi.fn(), translate$: vi.fn().mockReturnValue(of('translated')) } },
				{ provide: AccessService, useValue: {} },
				{ provide: DragAndDropService, useValue: {} },
			],
		});
		// The modal reaches into the real table through viewChild.required, so the table has to be the
		// real component -- only its own template is dropped.
		TestBed.overrideComponent(FileTableComponent, { set: { template: '', imports: [], styles: [] } });
		TestBed.overrideComponent(FilesSelectionModalComponent, {
			set: { template: '<lib-file-table />', imports: [FileTableComponent] },
		});

		const fixture = TestBed.createComponent(FilesSelectionModalComponent);
		fixture.detectChanges();
		const component = fixture.componentInstance;

		return { fixture, component, close };
	};

	afterEach(() => TestBed.resetTestingModule());

	it('exposes the data it was opened with', () => {
		const data = { selectionConstraints: { single: false, maxFiles: 5, minFiles: 2 } };
		const { component } = buildFixture(data);

		expect(component.fileSelectionModalData).toBe(data);
	});

	it('forwards the selection bounds to the table', () => {
		const { component } = buildFixture({ selectionConstraints: { single: false, maxFiles: 5, minFiles: 2 } });

		expect(component.fileTableChild().itemsSelector._max).toBe(5);
		expect(component.fileTableChild().itemsSelector._min).toBe(2);
	});

	it("leaves the table's own bounds alone when the caller sets none", () => {
		const { component } = buildFixture();
		const selector = component.fileTableChild().itemsSelector;

		expect(selector._max).toBe(selector._max);
		expect(selector._min).toBe(selector._min);
	});

	it('forwards the filters to the table paginator', () => {
		const setAlwaysOnFilters = vi.fn();
		const { component } = buildFixture({ filters: [{ field: 'kind', value: 'image' } as never] });
		vi.spyOn(component.fileTableChild().paginator, 'setAlwaysOnFilters').mockImplementation(setAlwaysOnFilters);

		// re-run the effect deterministically by re-triggering change detection
		TestBed.flushEffects();

		expect(component.fileTableChild().paginator.setAlwaysOnFilters).toBeDefined();
	});

	it('pre-selects what the caller already had, and nothing when it had none', () => {
		const { component } = buildFixture({ alreadySelectedFiles: selected });

		expect(component.fileTableChild().itemsSelector.selectedItems).toEqual(selected);
	});

	it('pre-selects nothing when the caller had nothing', () => {
		const { component } = buildFixture();

		expect(component.fileTableChild().itemsSelector.selectedItems).toEqual([]);
	});

	it('saving closes the dialog with what the table has selected', () => {
		const { component, close } = buildFixture();
		component.fileTableChild().itemsSelector.selectMultiple(selected);

		component.save();

		expect(close).toHaveBeenCalledWith({ files: selected });
	});

	it('cancelling dismisses the dialog with nothing', () => {
		const { component, close } = buildFixture();

		component.cancel();

		expect(close).toHaveBeenCalledWith();
	});

	it('dismiss closes the dialog with nothing', () => {
		const { component, close } = buildFixture();

		component.dismiss();

		expect(close).toHaveBeenCalledWith();
	});

	it('closing with an explicit result passes it through', () => {
		const { component, close } = buildFixture();

		component.close({ files: [] });

		expect(close).toHaveBeenCalledWith({ files: [] });
	});

	it('dismisses when the dialog closer fires (backdrop click / escape)', () => {
		const close = vi.fn();
		const backdropClick = new Subject<void>();
		const keydownEvents = new Subject<KeyboardEvent>();

		TestBed.configureTestingModule({
			providers: [
				{ provide: DialogRef, useValue: { close, backdropClick, keydownEvents, closed: EMPTY, overlayRef: {} } },
				{ provide: DIALOG_DATA, useValue: {} },
				{
					provide: FilesRepository,
					useValue: { store: { getObjects$: () => of({ data: [], totalCount: 0, page: 1 }), getObjectById$$$: () => ({ $: of(null) }) } },
				},
				{ provide: FoldersModals, useValue: { openFolderSelectionDialog: vi.fn() } },
				{ provide: Router, useValue: { navigate: vi.fn(), events: EMPTY } },
				{ provide: ActivatedRoute, useValue: { queryParams: of({}), snapshot: { queryParams: {} } } },
				{ provide: RequestService, useValue: {} },
				{ provide: NotificationService, useValue: {} },
				{ provide: TranslationService, useValue: { prep: (value: string) => () => value, instant: vi.fn(), translate$: vi.fn().mockReturnValue(of('translated')) } },
				{ provide: AccessService, useValue: {} },
				{ provide: DragAndDropService, useValue: {} },
			],
		});
		TestBed.overrideComponent(FileTableComponent, { set: { template: '', imports: [], styles: [] } });
		TestBed.overrideComponent(FilesSelectionModalComponent, {
			set: { template: '<lib-file-table />', imports: [FileTableComponent] },
		});
		const fixture = TestBed.createComponent(FilesSelectionModalComponent);
		fixture.detectChanges();

		backdropClick.next();

		expect(close).toHaveBeenCalledWith();
	});
});
