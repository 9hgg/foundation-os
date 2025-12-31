import { ExportOption } from '@foundation/canvas';
import { ChangeDetectionStrategy, Component, computed, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MotherComponent } from '../../../mother.component';

@Component({
	selector: 'lib-text-simple-request-block',
	standalone: true,
	imports: [FormsModule],
	templateUrl: './text-simple-request-block.component.html',
	styleUrl: './text-simple-request-block.component.css',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TextSimpleRequestBlockComponent extends MotherComponent implements OnDestroy {
	text = signal<string | null>(null);
	textLength = computed(() => this.text()?.length ?? 0);

	static override getExportOptions(): ExportOption<any>[] {
		const a: ExportOption<'string'> = {
			id: 'text-request-as-plain-text',
			kind: 'string',
			title: 'as Text',
			activeByDefault: true,
			displayedByDefault: true,
			description: 'Export the answer as plain text',
			perInteraction: true,
			fn(step, block, interaction, ownerId) {
				if (!interaction) return '';
				const interviewId = ownerId;
				const propertyId = 'text';
				const propertyKey = `${interviewId}.${step.id}.${block.id}.${propertyId}`;
				const HTMLvalue = interaction.config[propertyKey];
				const div = document.createElement('div');
				div.innerHTML = HTMLvalue;
				const text = div.innerText;
				if (!text) return '';
				if (text === 'undefined') return '';
				if (text === 'null') return '';
				return text;
			},
		};

		return [a];
	}

	constructor() {
		super();
		this.enlistSignalForInteractionStorage(this.text);
		this.enlistSignalForInteractionStorage(this.textLength);
	}
}
