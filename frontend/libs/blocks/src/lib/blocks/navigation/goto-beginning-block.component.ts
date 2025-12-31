import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { MotherComponent } from '../../mother.component';
import { TwChevronDoubleLeftIcon } from '@foundation/icons';

@Component({
	selector: 'lib-goto-beginning-block',
	standalone: true,
	imports: [TwChevronDoubleLeftIcon],
	templateUrl: './goto-beginning-block.component.html',
	styleUrl: './goto-beginning-block.component.css',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GoToBeginningBlockComponent extends MotherComponent {
	buttonText = signal('Go to Beginning');
	backgroundColor = signal('#16a34a'); // green-600
	textColor = signal('#ffffff');
	borderRadius = signal(6);

	constructor() {
		super();
		this.enlistSignalForBlockStorage(this.buttonText);
		this.enlistSignalForBlockStorage(this.backgroundColor);
		this.enlistSignalForBlockStorage(this.textColor);
		this.enlistSignalForBlockStorage(this.borderRadius);
	}

	goToBeginning() {
		if (!this.canvasManager) return;

		// Go to the first canvas
		const canvases = this.canvasManager.canvasesAsArray;
		if (canvases.length > 0) {
			this.canvasManager.selectCanvasById(canvases[0].id);
		}
	}
}
