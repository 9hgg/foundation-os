import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';

import { TranslationsRepository } from '@foundation/translations/state';
import { TranslationService } from '@foundation/translations/services';
import { TranslationTableComponent } from '@foundation/translations/ui';
import { TranslatePipe, TranslateDirective } from '@foundation/translations/services';
import { Interaction } from '@foundation/interactions/models';
import { InteractionTableComponent } from '@foundation/interactions/ui';
import { Filter } from '@foundation/network/store';
import { dialogCloser$ } from '@foundation/utils';
import { ChangeDetectionStrategy, Component, effect, Inject, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { tap } from 'rxjs';

export interface InteractionSelectionConstraints {
	maxInteractions?: number;
	minInteractions?: number;
	single: boolean;
}

export interface InteractionSelectionModalData {
	selectionConstraints?: InteractionSelectionConstraints;
	filters?: Filter[];
	interactions: Interaction[];
}

export const DEFAULT_INTERACTION_SELECTION_MODAL_DATA: Partial<InteractionSelectionModalData> & Required<Pick<InteractionSelectionModalData, 'selectionConstraints'>> = {
	selectionConstraints: {
		maxInteractions: 1,
		minInteractions: 1,
		single: true,
	},
};

export interface InteractionSelectionModalResult {
	interactions: Interaction[];
}

@Component({
	selector: 'lib-interactions-selection-modal',
	standalone: true,
	imports: [FormsModule, TranslateDirective, InteractionTableComponent],
	templateUrl: './interactions-selection-modal.component.html',
	changeDetection: ChangeDetectionStrategy.OnPush,
	styles: [
		`
			:host {
				display: block;
				padding: 5px;
				width: 100%;
				height: 100%;
				overflow: auto;
				/* font-size: 0px; */
				background-color: white;
				min-width: 200px;
				min-height: 200px;
			}
		`,
	],
	styleUrls: ['./interactions-selection-modal.component.css'],
})
export class InteractionsSelectionModalComponent {
	interactionTableChild = viewChild.required(InteractionTableComponent);

	constructor(
		private _dialogRef: DialogRef<InteractionSelectionModalResult, InteractionsSelectionModalComponent>,
		@Inject(DIALOG_DATA)
		public interactionSelectionModalData: InteractionSelectionModalData
	) {
		// following modal parameters to the interaction table
		effect(() => {
			const interactionTable = this.interactionTableChild();
			interactionTable.selectedInteractions._min = this.interactionSelectionModalData.selectionConstraints?.minInteractions ?? interactionTable.selectedInteractions._min;
			interactionTable.selectedInteractions._max = this.interactionSelectionModalData.selectionConstraints?.maxInteractions ?? interactionTable.selectedInteractions._max;
		});

		dialogCloser$(this._dialogRef)
			.pipe(
				takeUntilDestroyed(),
				tap((e) => {
					this.dismiss();
				})
			)
			.subscribe();
	}

	close(result: InteractionSelectionModalResult | undefined) {
		this._dialogRef.close(result);
	}

	dismiss() {
		this._dialogRef.close();
	}

	save() {
		this.close({
			interactions: this.interactionTableChild().selectedInteractions.selectedItems,
		});
	}

	cancel() {
		this.dismiss();
	}
}
