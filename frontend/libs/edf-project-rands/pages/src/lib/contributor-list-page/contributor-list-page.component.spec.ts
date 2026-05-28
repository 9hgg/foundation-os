import { of, throwError } from 'rxjs';
import { ContributorListPageComponent } from './contributor-list-page.component';

vi.mock('uuid', () => ({ v4: () => 'contributor-uuid' }));

describe('ContributorListPageComponent', () => {
	function createComponent() {
		const component = Object.create(ContributorListPageComponent.prototype) as any;
		component.contributorsRepository = {
			store: {
				postObject$: vi.fn().mockReturnValue(of({ result: { data: { id: 'contributor-created' } } })),
			},
			goToContributor: vi.fn(),
			previewFromFile$: vi.fn().mockReturnValue(of({ result: { preview: ['Alice'] } })),
			importFromFile$: vi.fn().mockReturnValue(of({ result: { inserted: 1, updated: 2, skipped: 3 } })),
			purgeAll$: vi.fn().mockReturnValue(of({ result: { deleted_contributors: 4, deleted_acls: 5 } })),
		};
		component._contributorsModals = {
			openContributorCreateDialog: vi.fn().mockReturnValue({
				closed: of({
					firstName: 'Alice',
					lastName: 'Martin',
					email: 'alice@example.com',
					category: 'A',
					unit: 'R&D',
					department: 'Data',
					group: 'Core',
				}),
			}),
			openImportPreviewDialog: vi.fn().mockReturnValue({
				closed: of({ selectedNames: ['Alice'] }),
			}),
		};
		component._fileModals = {
			openFilesSelectionDialog: vi.fn().mockReturnValue({
				closed: of({ files: [{ id: 'file-1' }] }),
			}),
		};
		component._notificationService = {
			error: vi.fn(),
			notify: vi.fn(),
			confirm: vi
				.fn()
				.mockReturnValueOnce({ closed: of(true) })
				.mockReturnValueOnce({ closed: of(true) }),
		};
		return component;
	}

	it('creates contributors and navigates to the created record', () => {
		const component = createComponent();

		component.createNew();

		expect(component.contributorsRepository.store.postObject$).toHaveBeenCalledWith(
			expect.objectContaining({
				id: 'contributor-uuid',
				firstName: 'Alice',
				group: 'Core',
			})
		);
		expect(component.contributorsRepository.goToContributor).toHaveBeenCalledWith('contributor-created');
	});

	it('imports contributors from Excel and reports success or preview errors', () => {
		const component = createComponent();

		component.importFromExcel();

		expect(component._fileModals.openFilesSelectionDialog).toHaveBeenCalled();
		expect(component.contributorsRepository.previewFromFile$).toHaveBeenCalledWith('file-1');
		expect(component._contributorsModals.openImportPreviewDialog).toHaveBeenCalledWith({ preview: ['Alice'] });
		expect(component.contributorsRepository.importFromFile$).toHaveBeenCalledWith('file-1', ['Alice']);
		expect(component._notificationService.notify).toHaveBeenCalledWith('Imported contributors: 1 inserted, 2 updated, 3 skipped', 'Import completed');

		component.contributorsRepository.previewFromFile$.mockReturnValueOnce(of({ error: { title: 'Preview failed' } }));
		component.importFromExcel();
		expect(component._notificationService.error).toHaveBeenCalledWith('Preview failed');
	});

	it('purges contributors with double confirmation and reports errors', () => {
		const component = createComponent();

		component.purgeAll();

		expect(component._notificationService.confirm).toHaveBeenCalledTimes(2);
		expect(component.contributorsRepository.purgeAll$).toHaveBeenCalled();
		expect(component._notificationService.notify).toHaveBeenCalledWith('Purge completed: deleted 4 contributors and 5 ACLs', 'Purge completed');

		component._notificationService.confirm = vi.fn().mockReturnValueOnce({ closed: of(true) }).mockReturnValueOnce({ closed: of(true) });
		component.contributorsRepository.purgeAll$.mockReturnValueOnce(of({ error: { title: 'Denied', description: 'No rights' } }));
		component.purgeAll();
		expect(component._notificationService.error).toHaveBeenCalledWith('Denied: No rights');

		component._notificationService.confirm = vi.fn().mockReturnValueOnce({ closed: of(true) }).mockReturnValueOnce({ closed: of(true) });
		component.contributorsRepository.purgeAll$.mockReturnValueOnce(throwError(() => new Error('network')));
		component.purgeAll();
		expect(component._notificationService.error).toHaveBeenCalledWith('Purge failed');
	});
});
