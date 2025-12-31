import { ExportOption } from '@foundation/canvas';
import { ChangeDetectionStrategy, Component, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MotherComponent } from '../../../mother.component';

@Component({
	selector: 'lib-checkbox-block',
	standalone: true,
	imports: [FormsModule],
	templateUrl: './checkbox-block.component.html',
	styleUrl: './checkbox-block.component.css',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CheckboxBlockComponent extends MotherComponent implements OnDestroy {
	checked = signal<boolean>(false);
	label = signal<string>('Checkbox option');
	required = signal<boolean>(false);

	static override getExportOptions(): ExportOption<any>[] {
		const a: ExportOption<'boolean'> = {
			id: 'checkbox-as-boolean',
			kind: 'boolean',
			title: 'as Boolean',
			activeByDefault: true,
			displayedByDefault: true,
			description: 'Export the checkbox state as boolean value',
			perInteraction: true,
			fn(step, block, interaction, ownerId) {
				if (!interaction) return false;
				const interviewId = ownerId;
				const propertyId = 'checked';
				const propertyKey = `${interviewId}.${step.id}.${block.id}.${propertyId}`;
				const value = interaction.config[propertyKey];
				return Boolean(value);
			},
		};

		const b: ExportOption<'string'> = {
			id: 'checkbox-as-text',
			kind: 'string',
			title: 'as Text',
			activeByDefault: false,
			displayedByDefault: false,
			description: 'Export the checkbox state as text (Yes/No)',
			perInteraction: true,
			fn(step, block, interaction, ownerId) {
				if (!interaction) return 'No';
				const interviewId = ownerId;
				const propertyId = 'checked';
				const propertyKey = `${interviewId}.${step.id}.${block.id}.${propertyId}`;
				const value = interaction.config[propertyKey];
				return value ? 'Yes' : 'No';
			},
		};

		return [a, b];
	}

	constructor() {
		super();
		this.enlistSignalForInteractionStorage(this.checked);
		this.enlistSignalForBlockStorage(this.label);
		this.enlistSignalForBlockStorage(this.required);
	}

	onLabelChange(event: Event): void {
		const target = event.target as HTMLElement;
		this.label.set(target.textContent || 'Checkbox option');
	}
}
