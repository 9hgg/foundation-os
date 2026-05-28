import { of } from 'rxjs';
import { BatchListPageComponent } from './batch-list-page.component';

vi.mock('uuid', () => ({ v4: () => 'batch-uuid' }));

describe('BatchListPageComponent', () => {
	function createComponent() {
		const component = Object.create(BatchListPageComponent.prototype) as any;
		component.batchesRepository = {
			store: {
				postObject$: vi.fn().mockReturnValue(of({ result: { data: { id: 'batch-created' } } })),
			},
			goToBatch: vi.fn(),
		};
		component._batchesModals = {
			openBatchCreateDialog: vi.fn().mockReturnValue({
				closed: of({ title: 'Batch', prefix: '1', projectId: 'project-1' }),
			}),
		};
		return component;
	}

	it('creates a batch and navigates to it', () => {
		const component = createComponent();

		component.createNew();

		expect(component.batchesRepository.store.postObject$).toHaveBeenCalledWith({
			id: 'batch-uuid',
			title: 'Batch',
			prefix: '1',
			projectId: 'project-1',
		});
		expect(component.batchesRepository.goToBatch).toHaveBeenCalledWith('batch-created');
	});

	it('ignores cancelled batch creation', () => {
		const component = createComponent();
		component._batchesModals.openBatchCreateDialog.mockReturnValueOnce({ closed: of(undefined) });

		component.createNew();

		expect(component.batchesRepository.store.postObject$).not.toHaveBeenCalled();
		expect(component.batchesRepository.goToBatch).not.toHaveBeenCalled();
	});
});
