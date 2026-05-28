import { TestBed } from '@angular/core/testing';
import { BatchesRepository } from '@edf/edf-project-rands/state';
import { ProjectBatchSelectorComponent } from './project-batch-selector.component';

function createSignal<T>(initialValue: T) {
	let value = initialValue;
	const signal: any = () => value;
	signal.set = (nextValue: T) => {
		value = nextValue;
	};
	return signal as (() => T) & { set: (value: T) => void };
}

describe('ProjectBatchSelectorComponent', () => {
	let batchesRepository: { goToBatch: ReturnType<typeof vi.fn> };

	beforeEach(() => {
		batchesRepository = {
			goToBatch: vi.fn(),
		};
		TestBed.configureTestingModule({
			providers: [{ provide: BatchesRepository, useValue: batchesRepository }],
		});
	});

	it('keeps the selected batch id and navigates to a batch', () => {
		const component = TestBed.runInInjectionContext(() => new ProjectBatchSelectorComponent()) as any;
		component.batches = createSignal([
			{ id: 'batch-1', title: 'Batch 1' },
			{ id: 'batch-2', title: 'Batch 2' },
		]);

		expect(component.selectedBatchId()).toBe('no-zero');
		component.selectedBatchId.set('batch-2');
		expect(component.selectedBatchId()).toBe('batch-2');

		const event = { preventDefault: vi.fn(), stopPropagation: vi.fn() };
		component.navigateToBatch(event as any, { id: 'batch-2' });

		expect(event.preventDefault).toHaveBeenCalled();
		expect(event.stopPropagation).toHaveBeenCalled();
		expect(batchesRepository.goToBatch).toHaveBeenCalledWith('batch-2');
	});
});
