import { Interaction } from '@foundation/interactions/models';
import { Selector } from '@foundation/utils';
import { CdkMenuModule } from '@angular/cdk/menu';

import { ChangeDetectionStrategy, Component, model } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
const DEBUG = false;

@Component({
	selector: 'lib-interaction-table',
	standalone: true,
	imports: [ReactiveFormsModule, CdkMenuModule],
	templateUrl: './interaction-table.component.html',
	styleUrl: './interaction-table.component.css',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InteractionTableComponent {
	explicitInteractions = model<(Interaction | null)[] | null>(null);

	selectedInteractions: Selector<Interaction> = new Selector<Interaction>((a, b) => a.id === b.id, []);
}
