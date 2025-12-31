import { ExportOption } from '@foundation/canvas';
import { ChangeDetectionStrategy, Component, computed, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MotherComponent } from '../../../mother.component';

export interface MultiSelectOption {
	value: string;
	label: string;
}

@Component({
	selector: 'lib-multi-select-block',
	standalone: true,
	imports: [FormsModule],
	templateUrl: './multi-select-block.component.html',
	styleUrl: './multi-select-block.component.css',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MultiSelectBlockComponent extends MotherComponent implements OnDestroy {
	// Generate unique radio group name
	radioGroupName = `multiselect-${Math.random().toString(36).substring(2, 15)}`;

	// Configuration signals
	options = signal<MultiSelectOption[]>([
		{ value: 'option1', label: 'Option 1' },
		{ value: 'option2', label: 'Option 2' },
		{ value: 'option3', label: 'Option 3' },
	]);
	minSelection = signal<number>(0);
	maxSelection = signal<number>(1);
	question = signal<string>('Please select your preferred option(s)');
	required = signal<boolean>(false);

	// State signals
	selectedValues = signal<string[]>([]);

	// Computed signals
	isRadioMode = computed(() => this.maxSelection() === 1);
	isValid = computed(() => {
		const selectedCount = this.selectedValues().length;
		const min = this.required() ? Math.max(1, this.minSelection()) : this.minSelection();
		return selectedCount >= min && selectedCount <= this.maxSelection();
	});

	static override getExportOptions(): ExportOption<any>[] {
		const jsonExport: ExportOption<'json'> = {
			id: 'multi-select-as-json',
			kind: 'json',
			title: 'as JSON Array',
			activeByDefault: true,
			displayedByDefault: true,
			description: 'Export selected values as a JSON array',
			perInteraction: true,
			fn(step, block, interaction, ownerId) {
				if (!interaction) return [];
				const interviewId = ownerId;
				const propertyId = 'selectedValues';
				const propertyKey = `${interviewId}.${step.id}.${block.id}.${propertyId}`;
				const value = interaction.config[propertyKey];
				return Array.isArray(value) ? value : [];
			},
		};

		const stringExport: ExportOption<'string'> = {
			id: 'multi-select-as-string',
			kind: 'string',
			title: 'as String',
			activeByDefault: false,
			displayedByDefault: false,
			description: 'Export selected values as comma-separated string',
			perInteraction: true,
			fn(step, block, interaction, ownerId) {
				if (!interaction) return '';
				const interviewId = ownerId;
				const propertyId = 'selectedValues';
				const propertyKey = `${interviewId}.${step.id}.${block.id}.${propertyId}`;
				const value = interaction.config[propertyKey];
				return Array.isArray(value) ? value.join(', ') : '';
			},
		};

		const labelsExport: ExportOption<'json'> = {
			id: 'multi-select-labels-as-json',
			kind: 'json',
			title: 'Labels as JSON',
			activeByDefault: false,
			displayedByDefault: true,
			description: 'Export selected option labels as a JSON array',
			perInteraction: true,
			fn(step, block, interaction, ownerId) {
				if (!interaction) return [];
				const interviewId = ownerId;
				const valuesPropertyKey = `${interviewId}.${step.id}.${block.id}.selectedValues`;
				const optionsPropertyKey = `${interviewId}.${step.id}.${block.id}.options`;
				const selectedValues = interaction.config[valuesPropertyKey] || [];
				const options = interaction.config[optionsPropertyKey] || [];

				if (!Array.isArray(selectedValues) || !Array.isArray(options)) return [];

				return selectedValues.map((value) => {
					const option = options.find((opt: any) => opt.value === value);
					return option ? option.label : value;
				});
			},
		};

		return [jsonExport, stringExport, labelsExport];
	}

	constructor() {
		super();
		this.enlistSignalForBlockStorage(this.options);
		this.enlistSignalForBlockStorage(this.minSelection);
		this.enlistSignalForBlockStorage(this.maxSelection);
		this.enlistSignalForBlockStorage(this.question);
		this.enlistSignalForBlockStorage(this.required);
		this.enlistSignalForInteractionStorage(this.selectedValues);
	}

	onSelectionChange(optionValue: string, isChecked: boolean): void {
		const current = [...this.selectedValues()];

		if (this.isRadioMode()) {
			// Radio mode: only one selection allowed
			this.selectedValues.set(isChecked ? [optionValue] : []);
		} else {
			// Checkbox mode: multiple selections allowed
			if (isChecked) {
				if (current.length < this.maxSelection()) {
					current.push(optionValue);
				}
			} else {
				const index = current.indexOf(optionValue);
				if (index > -1) {
					current.splice(index, 1);
				}
			}
			this.selectedValues.set(current);
		}
	}

	onRadioChange(optionValue: string, event: Event): void {
		const target = event.target as HTMLInputElement;
		this.onSelectionChange(optionValue, target.checked);
	}

	onCheckboxChange(optionValue: string, event: Event): void {
		const target = event.target as HTMLInputElement;
		this.onSelectionChange(optionValue, target.checked);
	}

	isSelected(optionValue: string): boolean {
		return this.selectedValues().includes(optionValue);
	}

	canSelectMore(): boolean {
		return this.selectedValues().length < this.maxSelection();
	}

	onQuestionChange(event: Event): void {
		const target = event.target as HTMLElement;
		this.question.set(target.textContent || 'Please select an option');
	}

	onQuestionInputChange(event: Event): void {
		const target = event.target as HTMLInputElement;
		this.question.set(target.value || 'Please select an option');
	}

	onOptionLabelChange(index: number, event: Event): void {
		const target = event.target as HTMLElement;
		const newLabel = target.textContent || `Option ${index + 1}`;
		const currentOptions = [...this.options()];
		currentOptions[index] = { ...currentOptions[index], label: newLabel };
		this.options.set(currentOptions);
	}

	onOptionLabelInputChange(index: number, event: Event): void {
		const target = event.target as HTMLInputElement;
		const newLabel = target.value || `Option ${index + 1}`;
		const currentOptions = [...this.options()];
		currentOptions[index] = { ...currentOptions[index], label: newLabel };
		this.options.set(currentOptions);
	}

	onOptionValueChange(index: number, event: Event): void {
		const target = event.target as HTMLInputElement;
		const newValue = target.value || `option${index + 1}`;
		const currentOptions = [...this.options()];
		const oldValue = currentOptions[index].value;
		currentOptions[index] = { ...currentOptions[index], value: newValue };
		this.options.set(currentOptions);

		// Update selected values if this option was selected
		const selectedValues = [...this.selectedValues()];
		const selectedIndex = selectedValues.indexOf(oldValue);
		if (selectedIndex > -1) {
			selectedValues[selectedIndex] = newValue;
			this.selectedValues.set(selectedValues);
		}
	}

	onOptionValueInputChange(index: number, event: Event): void {
		const target = event.target as HTMLInputElement;
		const newValue = target.value || `option${index + 1}`;
		const currentOptions = [...this.options()];
		const oldValue = currentOptions[index].value;
		currentOptions[index] = { ...currentOptions[index], value: newValue };
		this.options.set(currentOptions);

		// Update selected values if this option was selected
		const selectedValues = [...this.selectedValues()];
		const selectedIndex = selectedValues.indexOf(oldValue);
		if (selectedIndex > -1) {
			selectedValues[selectedIndex] = newValue;
			this.selectedValues.set(selectedValues);
		}
	}

	addOption(): void {
		const currentOptions = [...this.options()];
		const newIndex = currentOptions.length + 1;
		currentOptions.push({
			value: `option${newIndex}`,
			label: `Option ${newIndex}`,
		});
		this.options.set(currentOptions);
	}

	onMinSelectionChange(event: Event): void {
		const target = event.target as HTMLInputElement;
		const value = Math.max(0, parseInt(target.value) || 0);
		this.minSelection.set(value);
	}

	onMaxSelectionChange(event: Event): void {
		const target = event.target as HTMLInputElement;
		const value = Math.max(1, parseInt(target.value) || 1);
		this.maxSelection.set(value);

		// Trim selected values if exceeding new max
		const current = this.selectedValues();
		if (current.length > value) {
			this.selectedValues.set(current.slice(0, value));
		}
	}

	onRequiredChange(event: Event): void {
		const target = event.target as HTMLInputElement;
		this.required.set(target.checked);
	}

	removeOption(index: number): void {
		const currentOptions = [...this.options()];
		if (currentOptions.length <= 1) return; // Keep at least one option

		const removedOption = currentOptions[index];
		currentOptions.splice(index, 1);
		this.options.set(currentOptions);

		// Remove from selected values if it was selected
		const selectedValues = [...this.selectedValues()];
		const selectedIndex = selectedValues.indexOf(removedOption.value);
		if (selectedIndex > -1) {
			selectedValues.splice(selectedIndex, 1);
			this.selectedValues.set(selectedValues);
		}
	}

	moveOptionUp(index: number): void {
		if (index <= 0) return;
		const currentOptions = [...this.options()];
		[currentOptions[index - 1], currentOptions[index]] = [currentOptions[index], currentOptions[index - 1]];
		this.options.set(currentOptions);
	}

	moveOptionDown(index: number): void {
		const currentOptions = [...this.options()];
		if (index >= currentOptions.length - 1) return;
		[currentOptions[index], currentOptions[index + 1]] = [currentOptions[index + 1], currentOptions[index]];
		this.options.set(currentOptions);
	}

	onDragStart(event: DragEvent, index: number): void {
		if (event.dataTransfer) {
			event.dataTransfer.setData('text/plain', index.toString());
			event.dataTransfer.effectAllowed = 'move';
			// Add visual feedback
			const target = event.currentTarget as HTMLElement;
			target.style.opacity = '0.5';
		}
	}

	onDragEnd(event: DragEvent): void {
		// Remove visual feedback
		const target = event.currentTarget as HTMLElement;
		target.style.opacity = '';
	}

	onDragOver(event: DragEvent): void {
		event.preventDefault();
		event.dataTransfer!.dropEffect = 'move';
		// Add visual feedback for drop zone
		const target = event.currentTarget as HTMLElement;
		target.classList.add('drag-over');
	}

	onDragLeave(event: DragEvent): void {
		// Remove visual feedback
		const target = event.currentTarget as HTMLElement;
		target.classList.remove('drag-over');
	}

	onDrop(event: DragEvent, targetIndex: number): void {
		event.preventDefault();
		const sourceIndex = parseInt(event.dataTransfer!.getData('text/plain'));

		// Remove visual feedback
		const target = event.currentTarget as HTMLElement;
		target.classList.remove('drag-over');

		if (sourceIndex === targetIndex || isNaN(sourceIndex)) return;

		const currentOptions = [...this.options()];
		const [movedOption] = currentOptions.splice(sourceIndex, 1);
		currentOptions.splice(targetIndex, 0, movedOption);
		this.options.set(currentOptions);
	}
}
