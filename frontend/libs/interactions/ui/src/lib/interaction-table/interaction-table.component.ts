import { CdkMenuModule } from '@angular/cdk/menu';
import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, model } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { Interaction } from '@foundation/interactions/models';
import { TranslateDirective } from '@foundation/translations/services';
import { Selector } from '@foundation/utils';

@Component({
	selector: 'lib-interaction-table',
	standalone: true,
	imports: [ReactiveFormsModule, CdkMenuModule, CommonModule, TranslateDirective],
	templateUrl: './interaction-table.component.html',
	styleUrl: './interaction-table.component.css',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InteractionTableComponent {
	explicitInteractions = model<(Interaction | null)[] | null>(null);

	selectedInteractions: Selector<Interaction> = new Selector<Interaction>((a, b) => a.id === b.id, []);
}
